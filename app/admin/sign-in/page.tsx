import Header from "../Header";
import Login from "./Login";
import Silk from "../../components/halenn/cinematic/Silk";
import { database } from "../lib/db";
import { redirect } from "next/navigation";
export default async function Page() {
  const db = await database();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (user && (await db.rpc("halenn_is_founder")).data) redirect("/admin");
  return (
    <>
      <Header />
      <main className="hw-login">
        <div className="hw-login-art" aria-hidden="true" data-silk-scene>
          <Silk eager />
          <div className="hw-ribbon" />
        </div>
        <div className="hw-login-content">
          <h1>Founder sign-in</h1>
          <Login />
        </div>
      </main>
    </>
  );
}
