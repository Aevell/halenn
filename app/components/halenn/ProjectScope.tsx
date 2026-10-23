"use client";

import { useState } from "react";
import { useProjectScope } from "./Experience";
import { Arrow } from "./Brand";
import styles from "./cinematic.module.css";

const additions = [
  {
    name: "Webshop",
    description: "Product catalogue, collections and product pages.",
    model: "Project add-on",
  },
  {
    name: "Cart & checkout",
    description: "Payments, order flow and checkout integration.",
    model: "Project add-on",
  },
  {
    name: "n8n workflows",
    description: "Connect forms, orders, CRM and everyday tools.",
    model: "Scoped per workflow",
  },
  {
    name: "Website care",
    description: "Updates, backups, monitoring and ongoing changes.",
    model: "Monthly plan",
  },
  {
    name: "Bookings & forms",
    description: "Appointments, enquiries and useful data capture.",
    model: "Project add-on",
  },
  {
    name: "Content & search",
    description: "CMS setup, content structure and technical SEO.",
    model: "Project add-on",
  },
];

export default function ProjectScope() {
  const { selected, setSelected } = useProjectScope();
  const [downloaded, setDownloaded] = useState(false);
  const toggle = (name: string) => {
    setSelected((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
    setDownloaded(false);
  };
  const download = () => {
    const text = [
      "HALENN — PROJECT STARTING POINT",
      "A company by Aevell",
      "",
      "Foundation: Custom website design & development",
      ...selected.map((name) => `Add: ${name}`),
      "",
      "Pricing: Project quote based on scope. Website care is an optional monthly plan.",
      "This is a planning brief, not a submitted enquiry or a price commitment.",
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "halenn-project-brief.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  };

  return (
    <div className={styles.scopeBuilder}>
      <div className={styles.baseScope}>
        <span>THE FOUNDATION</span>
        <h3>A custom website.</h3>
        <p>Design & development, responsive layouts and a considered launch.</p>
        <span className={styles.priceModel}>Project-based quote</span>
      </div>
      <fieldset className={styles.additions} data-local-keys>
        <legend>Add what you need</legend>
        {additions.map((addition) => (
          <details key={addition.name} className={styles.serviceDetail}>
            <summary>
              {addition.name}
              <span>Explore +</span>
            </summary>
            <label className={styles.addition}>
              <input
                type="checkbox"
                checked={selected.includes(addition.name)}
                onChange={() => toggle(addition.name)}
              />
              <span>
                <strong>{addition.name}</strong>
                <span>{addition.description}</span>
              </span>
              <small>{addition.model}</small>
            </label>
          </details>
        ))}
      </fieldset>
      <div className={styles.scopeSummary}>
        <p aria-live="polite">
          Website
          {selected.length
            ? ` + ${selected.length} addition${selected.length === 1 ? "" : "s"}`
            : " design & development"}
          <span>Project pricing is tailored to your scope.</span>
        </p>
        <button type="button" onClick={download}>
          Download your brief <Arrow />
        </button>
      </div>
      <p className={styles.downloadNote} role="status">
        {downloaded
          ? "Brief downloaded. Nothing has been submitted."
          : "Save your selections as a starting point for your project."}
      </p>
      <noscript>
        <p>
          Choose your services when discussing your project. The interactive
          brief requires JavaScript; all service descriptions remain available
          above.
        </p>
      </noscript>
    </div>
  );
}
