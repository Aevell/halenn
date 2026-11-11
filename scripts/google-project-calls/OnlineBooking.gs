/** Halenn-owned scheduling. No Google guest invitations: Halenn sends the email. */
var HalennOnlineCalls = (function () {
  'use strict';
  var CALENDAR = 'aevellgroup@gmail.com';
  var ENDPOINT = 'https://halenn.com/api/project-call-result';
  var TITLE = 'Halenn · Project call';
  var TRACK = 'HALENN_ONLINE_TRACK_';
  var RESULT = 'HALENN_ONLINE_RESULT_';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var MEET = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
  function equal(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var difference = 0;
    for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return difference === 0;
  }
  function signature(value, deps) { return HalennProjectCalls.bytesToHex(deps.hmac(value, deps.secret)); }
  function envelope(body, deps) {
    var raw = JSON.stringify(body), stamp = String(Math.floor(deps.now() / 1000));
    return { body: raw, sentAt: stamp, signature: signature('online-response.' + stamp + '.' + raw, deps) };
  }
  function authenticate(input, deps) {
    if (!input || typeof input.body !== 'string' || input.body.length > 6000 || !/^\d{10}$/.test(input.sentAt || '')
      || !/^[a-f0-9]{64}$/.test(input.signature || '') || Math.abs(deps.now() / 1000 - Number(input.sentAt)) > 300
      || !equal(input.signature, signature('online-request.' + input.sentAt + '.' + input.body, deps))) throw new Error('Invalid request');
    var request = JSON.parse(input.body);
    if (request.version !== 1 || request.calendarId !== CALENDAR || !UUID.test(request.requestId)
      || ['availability', 'book', 'cancel'].indexOf(request.operation) === -1) throw new Error('Invalid request');
    if (request.operation !== 'availability' && request.eventId !== 'halenn' + request.requestId.replace(/-/g, '')) throw new Error('Invalid event');
    return request;
  }
  function offset(day, deps) {
    var zone = deps.format(new Date(day + 'T12:00:00Z'), 'Z');
    return zone.slice(0, 3) + ':' + zone.slice(3);
  }
  function bounds(day, deps) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid date');
    var nowDay = deps.format(new Date(deps.now()), 'yyyy-MM-dd');
    if (day < nowDay || Date.parse(day + 'T00:00:00Z') > Date.parse(nowDay + 'T00:00:00Z') + 60 * 86400000
      || new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) !== day) throw new Error('Invalid date');
    var zone = offset(day, deps);
    return { start: new Date(day + 'T08:00:00' + zone).toISOString(), end: new Date(day + 'T23:59:59' + zone).toISOString(), zone: zone };
  }
  function slots(day, deps) {
    var range = bounds(day, deps);
    var busy = deps.busy(range.start, range.end);
    if (!Array.isArray(busy)) throw new Error('Calendar unavailable');
    var events = deps.list(range.start, range.end);
    var count = events.filter(function (event) {
      return event.status !== 'cancelled' && event.summary && event.summary.indexOf(TITLE) === 0;
    }).length;
    if (count >= 3) return [];
    var available = [], first = Date.parse(day + 'T09:00:00' + range.zone);
    for (var minute = 0; minute <= 800; minute += 40) {
      var start = first + minute * 60000, end = start + 30 * 60000;
      if (start < deps.now() + 12 * 3600000) continue;
      // Ten minutes on either side; no overlap with opaque all-day/busy events.
      if (!busy.some(function (event) {
        var from = Date.parse(event.start), to = Date.parse(event.end);
        if (!isFinite(from) || !isFinite(to) || to <= from) throw new Error('Calendar unavailable');
        return start < to + 600000 && end + 600000 > from;
      })) available.push(new Date(start).toISOString());
    }
    return available;
  }
  function result(request, event, deps) {
    var body = { version: 1, calendarId: CALENDAR, requestId: request.requestId,
      operation: request.operation, eventId: request.eventId, status: event.status,
      updated: event.updated || new Date(deps.now()).toISOString() };
    if (event.status === 'cancelled') return body;
    if (event.status !== 'confirmed') return null;
    var entries = event.conferenceData && event.conferenceData.entryPoints || [];
    var meet = event.hangoutLink || (entries.filter(function (entry) { return entry.entryPointType === 'video'; })[0] || {}).uri;
    if (!MEET.test(meet || '')) return null;
    body.start = event.start && event.start.dateTime;
    body.end = event.end && event.end.dateTime;
    body.created = event.created;
    body.meetUrl = meet;
    return body;
  }
  function remember(body, deps) {
    if (!body) return;
    // Persist before delivery. The existing scheduled sync retries missed callbacks.
    deps.save(RESULT + body.requestId, JSON.stringify(body));
    deliver(body, deps);
  }
  function deliver(body, deps) {
    try {
      if (deps.deliver(envelope(body, deps))) {
        deps.remove(RESULT + body.requestId);
        if (body.status === 'unavailable') return;
        var tracking = JSON.parse(deps.load(TRACK + body.requestId) || '{}');
        tracking.version = body.updated;
        tracking.status = body.status;
        deps.save(TRACK + body.requestId, JSON.stringify(tracking));
      }
    } catch (_) { /* Signed result is retained; no secrets or response bodies logged. */ }
  }
  function process(input, deps) {
    var request = authenticate(input, deps);
    if (request.operation === 'availability') return envelope({ version: 1, calendarId: CALENDAR,
      requestId: request.requestId, operation: 'availability', slots: slots(request.day, deps) }, deps);
    var event = deps.get(request.eventId);
    if (request.operation === 'book') {
      if (!event) {
        var previous = JSON.parse(deps.load(TRACK + request.requestId) || '{}');
        if (previous.status === 'unavailable' || previous.status === 'cancelled') {
          return envelope({ version: 1, calendarId: CALENDAR, requestId: request.requestId,
            operation: 'book', eventId: request.eventId, status: previous.status,
            updated: previous.version || new Date(deps.now()).toISOString() }, deps);
        }
        if (typeof request.start !== 'string' || !['nl', 'en'].includes(request.language)
          || typeof request.name !== 'string' || request.name.length > 120
          || typeof request.email !== 'string' || request.email.length > 254) throw new Error('Invalid booking');
        var start = new Date(request.start);
        if (!isFinite(start.getTime())) throw new Error('Invalid booking');
        var day = deps.format(start, 'yyyy-MM-dd');
        if (slots(day, deps).indexOf(start.toISOString()) === -1) {
          var unavailable = { version: 1, calendarId: CALENDAR, requestId: request.requestId,
            operation: 'book', eventId: request.eventId, status: 'unavailable' };
          // A completed rejection is terminal for this request ID, even if an
          // old signed request is retried after the slot becomes free again.
          deps.save(TRACK + request.requestId, JSON.stringify({ eventId: request.eventId,
            start: start.toISOString(), created: deps.now(), status: 'unavailable' }));
          remember(unavailable, deps);
          return envelope(unavailable, deps);
        }
        deps.save(TRACK + request.requestId, JSON.stringify({ eventId: request.eventId, start: start.toISOString(), created: deps.now() }));
        event = deps.insert({ id: request.eventId, summary: TITLE + ' (' + request.name.replace(/[\r\n\x00-\x1f]/g, ' ') + ')',
          description: 'A 30-minute conversation about your business, what you’d like to achieve and how Halenn could help.\n'
            + 'Client: ' + request.name + '\nEmail: ' + request.email + '\nLanguage: ' + (request.language === 'nl' ? 'Dutch · Dave' : 'English · Dave or Terence')
            + '\nBooked through Halenn. Customer confirmation is sent by Halenn. Review the linked enquiry in the founder portal.',
          start: { dateTime: start.toISOString(), timeZone: 'Europe/Amsterdam' },
          end: { dateTime: new Date(start.getTime() + 1800000).toISOString(), timeZone: 'Europe/Amsterdam' },
          visibility: 'private', guestsCanInviteOthers: false,
          // No attendees means Google does not issue a separate guest invitation.
          extendedProperties: { private: { halennOnlineCall: request.requestId } },
          conferenceData: { createRequest: { requestId: request.eventId, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
        });
      }
      if (event.status !== 'cancelled' && (!event.extendedProperties || !event.extendedProperties.private
        || event.extendedProperties.private.halennOnlineCall !== request.requestId)) throw new Error('Unexpected calendar event');
    } else {
      if (!event || event.status === 'cancelled') {
        if (!deps.load(TRACK + request.requestId)) throw new Error('Unknown calendar event');
        event = { status: 'cancelled', updated: new Date(deps.now()).toISOString() };
      } else {
        if (!event.extendedProperties || !event.extendedProperties.private || event.extendedProperties.private.halennOnlineCall !== request.requestId) throw new Error('Unexpected calendar event');
        deps.cancel(request.eventId);
        event = { status: 'cancelled', updated: new Date(deps.now()).toISOString() };
      }
    }
    var body = result(request, event, deps);
    for (var attempt = 0; !body && attempt < 3; attempt++) {
      deps.sleep(600);
      body = result(request, deps.get(request.eventId), deps);
    }
    if (!body) throw new Error('Meeting link is being prepared');
    remember(body, deps);
    return envelope(body, deps);
  }
  function reconcile(deps) {
    Object.keys(deps.properties()).filter(function (key) { return key.indexOf(RESULT) === 0; }).slice(0,40).forEach(function (key) {
      var pendingResult = deps.load(key);
      if (pendingResult) deliver(JSON.parse(pendingResult), deps);
    });
    var keys = Object.keys(deps.properties()).filter(function (key) { return key.indexOf(TRACK) === 0; }).sort();
    var cursor = Number(deps.load('HALENN_ONLINE_CURSOR') || 0), processed = 0;
    for (var i = 0; i < Math.min(keys.length, 40); i++) {
      var key = keys[(cursor + i) % keys.length], id = key.slice(TRACK.length);
      var record = JSON.parse(deps.load(key)), pending = deps.load(RESULT + id);
      if (pending) deliver(JSON.parse(pending), deps);
      if (record.start && Date.parse(record.start) < deps.now() - 90 * 86400000) { deps.remove(key); continue; }
      if (record.status === 'cancelled' || record.status === 'unavailable') continue;
      try {
        var event = deps.get(record.eventId);
        // A previously observed event disappearing is a cancellation. An uncertain
        // insert is retried through its existing request, never guessed successful.
        if (!event && record.version) event = { status: 'cancelled', updated: new Date(deps.now()).toISOString() };
        if (!event) continue;
        var body = result({ requestId: id, eventId: record.eventId, operation: 'sync' }, event, deps);
        if (body && (body.updated !== record.version || body.status !== record.status)) remember(body, deps);
        processed++;
      } catch (_) { /* Retry next scan, leaving its confirmed state unchanged. */ }
    }
    deps.save('HALENN_ONLINE_CURSOR', String(keys.length ? (cursor + 40) % keys.length : 0));
    return { checked: processed };
  }
  function dependencies(properties) {
    var secret = properties.getProperty('HALENN_BOOKING_WEBHOOK_SECRET') || '';
    if (secret.length < 32 || properties.getProperty('HALENN_ONLINE_BOOKING_ENABLED') !== 'true') throw new Error('Online booking is disabled');
    return {
      secret: secret, now: function () { return Date.now(); },
      format: function (value, pattern) { return Utilities.formatDate(value, 'Europe/Amsterdam', pattern); },
      hmac: function (value, key) { return Utilities.computeHmacSha256Signature(value, key, Utilities.Charset.UTF_8); },
      load: function (key) { return properties.getProperty(key); }, save: function (key, value) { properties.setProperty(key, value); },
      remove: function (key) { properties.deleteProperty(key); }, properties: function () { return properties.getProperties(); },
      sleep: function (ms) { Utilities.sleep(ms); },
      get: function (id) { try { return Calendar.Events.get(CALENDAR, id); } catch (error) {
        if (/not found|gone|404|410/i.test(String(error))) return null; throw new Error('Calendar unavailable'); } },
      insert: function (event) { return Calendar.Events.insert(event, CALENDAR, { conferenceDataVersion: 1, sendUpdates: 'none' }); },
      cancel: function (id) { Calendar.Events.remove(CALENDAR, id, { sendUpdates: 'none' }); },
      busy: function (start, end) {
        var response = Calendar.Freebusy.query({ timeMin: start, timeMax: end, items: [{ id: CALENDAR }] });
        var calendar = response.calendars && response.calendars[CALENDAR];
        if (!calendar || (calendar.errors && calendar.errors.length)) throw new Error('Calendar unavailable');
        return calendar.busy;
      },
      list: function (start, end) {
        var events = [], page;
        for (var i = 0; i < 10; i++) {
          var options = { timeMin: start, timeMax: end, singleEvents: true, maxResults: 250 };
          if (page) options.pageToken = page;
          var response = Calendar.Events.list(CALENDAR, options);
          events = events.concat(response.items || []); page = response.nextPageToken;
          if (!page) return events;
        }
        throw new Error('Calendar is too busy to check safely');
      },
      deliver: function (signed) {
        var response = UrlFetchApp.fetch(ENDPOINT, { method: 'post', contentType: 'application/json',
          payload: signed.body, headers: { 'X-Halenn-Signature': signed.signature, 'X-Halenn-Timestamp': signed.sentAt },
          muteHttpExceptions: true, followRedirects: false });
        if (response.getResponseCode() !== 200) return false;
        return JSON.parse(response.getContentText()).accepted === true;
      }
    };
  }
  function handle(event) {
    var lock = LockService.getScriptLock();
    try {
      var properties = PropertiesService.getScriptProperties(), deps = dependencies(properties);
      var raw = event && event.postData && event.postData.contents;
      if (typeof raw !== 'string' || raw.length > 10000) throw new Error('Invalid request');
      var input = JSON.parse(raw);
      authenticate(input, deps); // Reject untrusted requests before taking the lock.
      if (!lock.tryLock(15000)) throw new Error('Please try again');
      return ContentService.createTextOutput(JSON.stringify(process(input, deps))).setMimeType(ContentService.MimeType.JSON);
    } catch (_) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'Booking could not be completed. Please check your booking page.' })).setMimeType(ContentService.MimeType.JSON);
    } finally { if (lock.hasLock()) lock.releaseLock(); }
  }
  function sync() {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty('HALENN_ONLINE_BOOKING_ENABLED') !== 'true') return { skipped: 'disabled' };
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return { skipped: 'busy' };
    try { return reconcile(dependencies(properties)); } finally { lock.releaseLock(); }
  }
  return { handle: handle, sync: sync, process: process, slots: slots, reconcile: reconcile, authenticate: authenticate };
}());
function doPost(event) { return HalennOnlineCalls.handle(event); }
