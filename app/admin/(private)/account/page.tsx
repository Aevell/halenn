import { founder, passwordRequired } from "../../lib/db";
import Password from "./Password";
export default async function Account() {
  const { user } = await founder();
  return (
    <section className="hw-enter hw-account-page">
      <h1>Account</h1>
      <p>
        {(await passwordRequired())
          ? "Choose a new password to open your founder workspace."
          : user.email}
      </p>
      <Password />
    </section>
  );
}
