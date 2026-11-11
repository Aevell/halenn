/**
 * Owner-run, read-only Google Calendar → Halenn project-call sync.
 * Nothing runs until setup is invoked and HALENN_BOOKING_SYNC_ENABLED is true.
 * Do not add secrets to this file. Configure Script Properties instead.
 */
var HalennProjectCalls = (function () {
  'use strict';

  var CALENDAR_ID = 'aevellgroup@gmail.com';
  var ENDPOINT = 'https://halenn.com/api/project-call-events';
  var TITLE = 'Halenn · Project call';
  var DESCRIPTION = 'A 30-minute conversation about your business, what you’d like to achieve and how Halenn could help.';
  var STATE_POINTER = 'HALENN_PROJECT_CALL_STATE';
  var STATE_PREFIX = 'HALENN_PROJECT_CALL_CHUNK_';
  var MAX_KNOWN = 1500;
  var MAX_STATE_BYTES = 180000;
  var CHUNK_LENGTH = 7000;
  var BATCH_SIZE = 50;
  var MAX_BATCH_BYTES = 80000;
  var DAY_MS = 86400000;

  function date(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    var number = Date.parse(value);
    return isFinite(number) ? new Date(number).toISOString() : null;
  }

  function email(value) {
    if (typeof value !== 'string') return '';
    var normalized = value.trim().toLowerCase();
    if (normalized.length > 254 || normalized.split('@')[0].length > 64) return '';
    if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) return '';
    return normalized.split('@')[1].split('.').every(function (label) { return label.length <= 63; }) ? normalized : '';
  }

  function text(value) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&rsquo;|&lsquo;|&#39;|&#8216;|&#8217;|&#x2019;|&#x2018;/gi, "'")
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function titleMatches(value) {
    var title = text(value);
    if (title === TITLE) return true;
    return title.indexOf(TITLE) === 0 && /^[\s([{–—-]/.test(title.slice(TITLE.length));
  }

  /** Returns only the fields permitted by the endpoint contract. */
  function selectEvent(raw, known) {
    if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id.length > 1024) return null;
    var previous = known && Object.prototype.hasOwnProperty.call(known, raw.id) ? known[raw.id] : null;
    var updated = date(raw.updated);
    if (previous && updated && Date.parse(updated) < Date.parse(previous.updated)) return null;

    if (raw.status === 'cancelled') {
      if (!previous) return null;
      if (!updated && previous.status === 'cancelled') return null;
      if (previous.status === 'cancelled' && Date.parse(updated) === Date.parse(previous.updated)) return null;
      var cancellation = { id: raw.id, status: 'cancelled' };
      if (updated) cancellation.updated = updated;
      return cancellation;
    }

    if (raw.status !== 'confirmed' || !updated || !date(raw.created)) return null;
    if (previous && Date.parse(updated) <= Date.parse(previous.updated)) return null;
    if (email(raw.organizer && raw.organizer.email) !== CALENDAR_ID) return null;
    if (!titleMatches(raw.summary) || text(raw.description).indexOf(text(DESCRIPTION)) === -1) return null;
    var start = date(raw.start && raw.start.dateTime);
    var end = date(raw.end && raw.end.dateTime);
    if (!start || !end || Date.parse(end) - Date.parse(start) !== 30 * 60000) return null;

    var guests = {};
    var uncertainGuest = false;
    (raw.attendees || []).forEach(function (attendee) {
      var address = email(attendee.email);
      if (address === CALENDAR_ID || attendee.self || attendee.organizer || attendee.resource) return;
      if (!address) { uncertainGuest = true; return; }
      guests[address] = Array.from(String(attendee.displayName || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 180).join('');
    });
    var addresses = Object.keys(guests);
    // Preserve the actual booking even if guest identity requires admin review.
    // Never guess which person is the lead when multiple guests are present.
    var result = {
      id: raw.id,
      status: 'confirmed',
      updated: updated,
      created: date(raw.created),
      start: start,
      end: end,
      attendeeEmail: addresses.length === 1 && !uncertainGuest ? addresses[0] : null,
      attendeeName: addresses.length === 1 && !uncertainGuest ? guests[addresses[0]] : null
    };
    // Google does not document the rendered question-answer format. Keep this
    // optional until the real booking form's output has been checked in setup.
    var answers = text(raw.description).match(/\bPreferred language(?:\s*\(Dutch or English\))?\s*:?\s*(English|Dutch)\b/gi) || [];
    if (answers.length === 1) result.preferredLanguage = /Dutch$/i.test(answers[0]) ? 'nl' : 'en';
    return result;
  }

  function remember(known, event, now) {
    var row = { status: event.status, updated: event.updated || known[event.id].updated };
    if (event.status === 'cancelled') row.cancelledAt = new Date(now).toISOString();
    Object.defineProperty(known, event.id, { value: row, enumerable: true, configurable: true, writable: true });
  }

  function prune(known, now) {
    Object.keys(known).forEach(function (id) {
      var item = known[id];
      if (item.status === 'cancelled' && Date.parse(item.cancelledAt || item.updated) < now - 90 * DAY_MS) delete known[id];
    });
    if (Object.keys(known).length > MAX_KNOWN) {
      throw new Error('Halenn sync cache reached its safe capacity. Review or migrate its state before continuing; the sync token has not advanced.');
    }
  }

  function bytesToHex(bytes) {
    return bytes.map(function (value) { return ((value + 256) % 256).toString(16).padStart(2, '0'); }).join('');
  }

  function payload(events, scanStartedAt) {
    var body = { version: 1, calendarId: CALENDAR_ID, events: events };
    if (scanStartedAt !== undefined) body.scanStartedAt = scanStartedAt;
    return JSON.stringify(body);
  }

  function utf8Length(value) {
    var length = 0;
    for (var character of value) {
      var point = character.codePointAt(0);
      length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    }
    return length;
  }

  function postBatch(events, deps, scanStartedAt) {
    var raw = payload(events, scanStartedAt);
    var attempts = 3;
    var timestamp = String(Math.floor(deps.now() / 1000));
    var signature = bytesToHex(deps.hmac(timestamp + '.' + raw, deps.secret));
    for (var attempt = 0; attempt < attempts; attempt += 1) {
      var code = 0;
      try {
        code = deps.fetch(ENDPOINT, {
          method: 'post',
          contentType: 'application/json',
          payload: raw,
          headers: { 'X-Halenn-Timestamp': timestamp, 'X-Halenn-Signature': signature },
          muteHttpExceptions: true,
          followRedirects: false
        }).getResponseCode();
      } catch (_error) {
        // Do not log request data, response data, or secrets.
      }
      if (code >= 200 && code < 300) return;
      var retryable = code === 0 || code === 429 || code >= 500;
      if (!retryable || attempt === attempts - 1) {
        throw new Error('Halenn booking endpoint did not accept a batch (HTTP ' + code + '). Sync state was not advanced.');
      }
      deps.sleep(500 * Math.pow(2, attempt));
    }
  }

  function isInvalidToken(error) {
    return /\b410\b|fullSyncRequired|sync token.*(invalid|no longer valid|expired)|full sync is required/i.test(String(error));
  }

  function isMissingEvent(error) {
    return /\b404\b|\b410\b|not found|resource has been deleted/i.test(String(error));
  }

  /** deps make sync behavior testable without any Google or network access. */
  function runSync(state, deps) {
    var scanStartedAt = new Date(deps.now()).toISOString();
    var known = JSON.parse(JSON.stringify(state.known || {}));
    var originalToken = state.syncToken || null;
    var token = originalToken;
    var matched = [];
    var seenKnown = {};
    var nextToken = null;

    function scan() {
      var pageToken;
      var pages = 0;
      do {
        var options = {
          maxResults: 2500,
          showDeleted: true,
          singleEvents: false,
          fields: 'items(id,status,updated,created,summary,description,organizer(email),start(dateTime),end(dateTime),attendees(email,displayName,self,organizer,resource)),nextPageToken,nextSyncToken'
        };
        if (token) options.syncToken = token;
        if (pageToken) options.pageToken = pageToken;
        var page = deps.list(CALENDAR_ID, options);
        (page.items || []).forEach(function (raw) {
          if (Object.prototype.hasOwnProperty.call(known, raw.id)) seenKnown[raw.id] = true;
          var selected = selectEvent(raw, known);
          if (!selected) return;
          remember(known, selected, deps.now());
          matched.push(selected);
        });
        pageToken = page.nextPageToken;
        nextToken = page.nextSyncToken || null;
        pages += 1;
        if (pages >= 100 && pageToken) throw new Error('Calendar scan exceeded the safe page limit; sync state was not advanced.');
      } while (pageToken);
    }

    try {
      scan();
    } catch (error) {
      if (!token || !isInvalidToken(error)) throw error;
      // Preserve known IDs for deletion reconciliation. Do not wipe CRM history.
      token = null;
      known = JSON.parse(JSON.stringify(state.known || {}));
      matched = [];
      seenKnown = {};
      scan();
    }
    if (!nextToken) throw new Error('Google did not return a complete sync token; nothing was sent.');

    if (!token) {
      Object.keys(state.known || {}).forEach(function (id) {
        if (seenKnown[id] || state.known[id].status === 'cancelled') return;
        var raw;
        try {
          raw = deps.get(CALENDAR_ID, id);
        } catch (error) {
          if (!isMissingEvent(error)) throw error;
          raw = { id: id, status: 'cancelled' };
        }
        var selected = selectEvent(raw, known);
        if (selected) {
          remember(known, selected, deps.now());
          matched.push(selected);
        }
      });
    }

    prune(known, deps.now());
    var newState = { version: 1, syncToken: nextToken, known: known, lastSuccessfulSync: new Date(deps.now()).toISOString() };
    // Check capacity before sending anything; save uses the same serialization.
    if (JSON.stringify(newState).length > MAX_STATE_BYTES) {
      throw new Error('Halenn sync state is too large for Script Properties; sync state was not advanced.');
    }
    var batch = [];
    matched.forEach(function (event) {
      var candidate = batch.concat([event]);
      if (candidate.length > BATCH_SIZE || utf8Length(payload(candidate)) > MAX_BATCH_BYTES) {
        if (batch.length === 0) throw new Error('A project-call update exceeds the safe transport limit.');
        postBatch(batch, deps);
        batch = [event];
      } else {
        batch = candidate;
      }
    });
    if (batch.length) postBatch(batch, deps);
    // Only this final accepted checkpoint proves all changes from a scan that
    // began at scanStartedAt have reached Halenn. Partial batches never do.
    postBatch([], deps, scanStartedAt);
    newState.lastSuccessfulSync = new Date(deps.now()).toISOString();
    deps.save(newState);
    return { sent: matched.length, tracked: Object.keys(known).length, recovered: Boolean(originalToken && !token) };
  }

  function loadState(properties) {
    var pointerText = properties.getProperty(STATE_POINTER);
    if (!pointerText) return { version: 1, syncToken: null, known: {} };
    var pointer = JSON.parse(pointerText);
    if (!pointer.generation || !Number.isInteger(pointer.chunks) || pointer.chunks < 1 || pointer.chunks > 40) throw new Error('Halenn state manifest is invalid. Do not reset without reconciling tracked bookings.');
    var serialized = '';
    for (var index = 0; index < pointer.chunks; index += 1) {
      var chunk = properties.getProperty(STATE_PREFIX + pointer.generation + '_' + index);
      if (chunk === null) throw new Error('Halenn sync state is incomplete. Restore its state before continuing.');
      serialized += chunk;
    }
    var state = JSON.parse(serialized);
    if (state.version !== 1 || !state.known || typeof state.known !== 'object' || !state.syncToken) throw new Error('Halenn sync state is invalid.');
    Object.keys(state.known).forEach(function (id) {
      var row = state.known[id];
      if (!date(row.updated) || ['confirmed', 'cancelled'].indexOf(row.status) === -1) throw new Error('Halenn tracked-event state is invalid.');
    });
    return state;
  }

  function saveState(properties, state, uuid) {
    var serialized = JSON.stringify(state);
    if (serialized.length > MAX_STATE_BYTES) throw new Error('Halenn sync state exceeds its safe storage capacity.');
    var generation = uuid();
    var chunks = Math.ceil(serialized.length / CHUNK_LENGTH);
    // Clean only abandoned generations; keep the currently published snapshot.
    var oldPointer = properties.getProperty(STATE_POINTER);
    var currentGeneration = oldPointer ? JSON.parse(oldPointer).generation : null;
    Object.keys(properties.getProperties()).forEach(function (key) {
      if (key.indexOf(STATE_PREFIX) === 0 && key.indexOf(STATE_PREFIX + currentGeneration + '_') !== 0) properties.deleteProperty(key);
    });
    for (var index = 0; index < chunks; index += 1) {
      properties.setProperty(STATE_PREFIX + generation + '_' + index, serialized.slice(index * CHUNK_LENGTH, (index + 1) * CHUNK_LENGTH));
    }
    // One small property publishes the complete new state atomically.
    properties.setProperty(STATE_POINTER, JSON.stringify({ generation: generation, chunks: chunks }));
    Object.keys(properties.getProperties()).forEach(function (key) {
      if (key.indexOf(STATE_PREFIX) === 0 && key.indexOf(STATE_PREFIX + generation + '_') !== 0) properties.deleteProperty(key);
    });
  }

  function settings(properties) {
    var secret = properties.getProperty('HALENN_BOOKING_WEBHOOK_SECRET') || '';
    if (secret.length < 32) throw new Error('Set a random HALENN_BOOKING_WEBHOOK_SECRET of at least 32 characters in Script Properties.');
    return { secret: secret, enabled: properties.getProperty('HALENN_BOOKING_SYNC_ENABLED') === 'true' };
  }

  function sync() {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty('HALENN_BOOKING_SYNC_ENABLED') !== 'true') return { skipped: 'disabled' };
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return { skipped: 'already-running' };
    try {
      var config = settings(properties);
      return runSync(loadState(properties), {
        now: function () { return Date.now(); },
        list: function (id, options) { return Calendar.Events.list(id, options); },
        get: function (id, eventId) { return Calendar.Events.get(id, eventId); },
        fetch: function (url, options) { return UrlFetchApp.fetch(url, options); },
        hmac: function (value, secret) { return Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8); },
        sleep: function (milliseconds) { Utilities.sleep(milliseconds); },
        secret: config.secret,
        save: function (state) { saveState(properties, state, function () { return Utilities.getUuid(); }); }
      });
    } finally {
      lock.releaseLock();
    }
  }

  function setup() {
    var properties = PropertiesService.getScriptProperties();
    settings(properties);
    // Confirm read access without sending, retaining, or printing event content.
    Calendar.Events.list(CALENDAR_ID, { maxResults: 1, fields: 'nextPageToken' });
    var handlers = ['onHalennCalendarUpdated', 'syncHalennProjectCalls'];
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
    });
    ScriptApp.newTrigger('onHalennCalendarUpdated').forUserCalendar(CALENDAR_ID).onEventUpdated().create();
    ScriptApp.newTrigger('syncHalennProjectCalls').timeBased().everyMinutes(5).create();
    return { installed: true, enabled: properties.getProperty('HALENN_BOOKING_SYNC_ENABLED') === 'true' };
  }

  function inspect() {
    var properties = PropertiesService.getScriptProperties();
    var state = loadState(properties);
    return {
      enabled: properties.getProperty('HALENN_BOOKING_SYNC_ENABLED') === 'true',
      initialized: Boolean(state.syncToken),
      trackedEvents: Object.keys(state.known).length,
      lastSuccessfulSync: state.lastSuccessfulSync || null
    };
  }

  return { setup: setup, sync: sync, inspect: inspect, selectEvent: selectEvent, runSync: runSync, loadState: loadState, saveState: saveState, bytesToHex: bytesToHex };
}());

function setupHalennProjectCallSync() { return HalennProjectCalls.setup(); }
function syncHalennProjectCalls() { return HalennProjectCalls.sync(); }
function inspectHalennProjectCallSync() { return HalennProjectCalls.inspect(); }
function onHalennCalendarUpdated(event) {
  if (event && event.calendarId && event.calendarId !== 'aevellgroup@gmail.com') return { skipped: 'different-calendar' };
  return HalennProjectCalls.sync();
}
