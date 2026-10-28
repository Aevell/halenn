import Concept from "../Concept";
import { Arrow } from "../Brand";
import { ActionLink } from "./Action";
import s from "./services.module.css";

function WorkflowIcon({ type }: { type: "order" | "connect" | "complete" }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    {type === "order" ? <path d="M5 19 19 5M5 5h14v14" /> : type === "complete" ? <path d="m5 12 4 4L19 6" /> : <><rect x="2" y="9" width="6" height="6" rx="2" /><rect x="16" y="2" width="6" height="6" rx="2" /><rect x="16" y="16" width="6" height="6" rx="2" /><path d="M8 12h3a2 2 0 0 0 2-2V7a2 2 0 0 1 2-2h1M8 12h3a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h1" /></>}
  </svg>;
}

const services = [
  { id: "websites", label: "01 / Websites", title: <>First, make<br /><em>an impression.</em></>, text: "A considered website makes your business feel as good online as it does in person. Every screen, every detail, every next step.", detail: "Custom design · Development · Content", action: "Explore your website" },
  { id: "commerce", label: "02 / Commerce", title: <>Turn interest<br /><em>into an order.</em></>, text: "Give people a clear path from discovery to checkout. A beautiful webshop, a thoughtful cart and the right payment connections.", detail: "Webshops · Cart & checkout · Payments", action: "Plan your webshop" },
  { id: "automation", label: "03 / Automation", title: <>Then, connect<br /><em>what’s next.</em></>, text: "Put the work behind the website in motion. Connect enquiries, orders and everyday tools with n8n workflows built around your business.", detail: "n8n workflows · Integrations · Website care", action: "Connect your systems" },
];

export default function Services() {
  return <section id="services" className={s.services} aria-label="Websites, commerce and automation" data-services>
    <div className={s.visualColumn} aria-hidden="true">
      <div className={s.visualStage} data-service-stage>
        <div className={s.light} data-service-light />
        <div className={s.scene} data-service-camera>
          <div className={s.website} data-website-visual>
            <div className={s.browserBar}><span /><span /><span /><p>object.store / Concept preview</p></div>
            <Concept index={1} />
          </div>
          <div className={s.checkout} data-checkout-visual>
            <div className={s.checkoutTop}><span>Your collection</span><span>01</span></div>
            <div className={s.product}><div className={s.object}><i /></div><div><strong>The Everyday Lamp</strong><p>Brushed aluminium</p><span>€240.00</span></div></div>
            <div className={s.total}><span>Subtotal</span><strong>€240.00</strong></div>
            <div className={s.checkoutAction}>Continue to checkout <Arrow /></div>
            <p className={s.example}>Illustrative store & checkout</p>
          </div>
          <div className={s.workflow} data-workflow-visual>
            <p className={s.workflowTitle}>One order. Everything connected.</p>
            <div className={s.workflowNodes}>
              <div><span className={s.nodeIcon}><WorkflowIcon type="order" /></span><strong>New order</strong><p>Website</p></div>
              <i />
              <div><span className={s.nodeIcon}><WorkflowIcon type="connect" /></span><strong>Connect</strong><p>n8n workflow</p></div>
              <i />
              <div><span className={s.nodeIcon}><WorkflowIcon type="complete" /></span><strong>All in sync</strong><p>CRM & team</p></div>
            </div>
            <div className={s.workflowResult}><span />Order received · Team notified · Follow-up ready</div>
            <p className={s.example}>Example workflow</p>
          </div>
        </div>
        <div className={s.sceneProgress}><span>From first impression to everyday operation</span><i><b data-service-progress /></i></div>
      </div>
    </div>
    <div className={s.chapters}>
      {services.map((service) => <article key={service.id} id={service.id} className={s.chapter} data-service-chapter tabIndex={-1}>
        <p className={s.label}>{service.label}</p>
        <h2>{service.title}</h2>
        <p className={s.description}>{service.text}</p>
        <p className={s.detail}>{service.detail}</p>
        <ActionLink href="#scope" quiet>{service.action}</ActionLink>
      </article>)}
    </div>
  </section>;
}
