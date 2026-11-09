import { founder, passwordRequired } from "../../lib/db";
import Password from "./Password";
import EnquiryNotifications from "./EnquiryNotifications";
export default async function Account() {
  const { user } = await founder();
  const needsPassword = await passwordRequired();
  return (
    <section className="hw-enter hw-account-page">
      <h1>Account</h1>
      <p>
        {needsPassword
          ? "Choose a new password to open your founder workspace."
          : user.email}
      </p>
      <Password />
      {!needsPassword && <EnquiryNotifications />}
    </section>
  );
}
