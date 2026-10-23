import Image from "next/image";
import { Arrow } from "./Shared";
import s from "./concept.module.css";

/** Static website studies inside one accessible project-preview button. */
export default function Concept({ index }: { index: number }) {
  return (
    <div
      data-concept
      className={`${s.site} ${[s.forma, s.object, s.connected][index]}`}
      aria-hidden="true"
    >
      <div className={s.navigation}>
        <span className={s.brand}>
          {["forma.", "OBJECT", "connected"][index]}
        </span>
        <span className={s.menu}>
          {
            [
              "Architecture    Studio    Contact",
              "Collection    Our approach    Bag (0)",
              "Platform    Workflows    Contact",
            ][index]
          }
        </span>
        <span className={s.menuMobile}>
          Menu <span>+</span>
        </span>
      </div>
      {index === 0 ? (
        <>
          <div className={s.architectureHero}>
            <Image
              src="/prototypes/projects/forma-residence.jpg"
              alt=""
              fill
              sizes="(max-width: 600px) 90vw, 70vw"
              draggable={false}
            />
            <div className={s.architectureCopy}>
              <div className={s.editorialTitle}>
                A quieter
                <br />
                way to live.
              </div>
              <span className={s.mockAction}>
                Explore our work <Arrow />
              </span>
            </div>
          </div>
          <div className={s.bottom}>
            <span>Architecture shaped by its surroundings.</span>
            <span>
              Coastal residence <Arrow />
            </span>
          </div>
        </>
      ) : index === 1 ? (
        <>
          <div className={s.shopHero}>
            <div className={s.shopCopy}>
              <div className={s.shopTitle}>
                Objects with
                <br />
                <em>lasting presence.</em>
              </div>
              <p>
                Considered furniture.
                <br />
                For the spaces we call home.
              </p>
              <span className={s.mockAction}>
                Discover the collection <Arrow />
              </span>
            </div>
            <div className={s.productImage}>
              <Image
                src="/prototypes/projects/object-lounge.jpg"
                alt=""
                fill
                sizes="(max-width: 600px) 90vw, 45vw"
                draggable={false}
              />
            </div>
          </div>
          <div className={s.bottom}>
            <span>The living collection</span>
            <span>
              Lounge chairs{" "}
              <span className={s.hideSmall}> / Tables / Objects</span> <Arrow />
            </span>
          </div>
        </>
      ) : (
        <>
          <div className={s.workflowHero}>
            <div className={s.workflowCopy}>
              <div className={s.workflowTitle}>
                Less busywork.
                <br />
                <em>More possibility.</em>
              </div>
              <p>
                Bring your tools together.
                <br />
                Give your team room to think.
              </p>
              <span className={s.mockAction}>
                Explore workflows <Arrow />
              </span>
            </div>
            <div className={s.workspace}>
              <div className={s.workspaceTop}>
                <span>Enquiry workflow</span>
                <span className={s.live}>Preview</span>
              </div>
              <div className={s.flowRow}>
                <span className={s.flowIcon}>@</span>
                <div>
                  <strong>New enquiry</strong>
                  <span>Website form received</span>
                </div>
                <span className={s.flowCheck}>✓</span>
              </div>
              <div className={s.flowConnector} />
              <div className={s.flowRow}>
                <span className={`${s.flowIcon} ${s.n8n}`}>n8n</span>
                <div>
                  <strong>Find the right next step</strong>
                  <span>Qualify & route</span>
                </div>
                <span className={s.flowCheck}>✓</span>
              </div>
              <div className={s.flowConnector} />
              <div className={s.flowRow}>
                <span className={s.flowIcon}>
                  <Arrow />
                </span>
                <div>
                  <strong>Ready for your team</strong>
                  <span>CRM updated · follow-up created</span>
                </div>
                <span className={s.flowCheck}>✓</span>
              </div>
            </div>
          </div>
          <div className={s.bottom}>
            <span>From first contact to next action.</span>
            <span>
              Built around your tools <Arrow />
            </span>
          </div>
        </>
      )}
    </div>
  );
}
