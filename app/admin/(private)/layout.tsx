import { founder } from "../lib/db";
import Header from "../Header";
export default async function Private({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await founder();
  return (
    <>
      <Header email={user.email} />
      <main className="hw-main">{children}</main>
    </>
  );
}
