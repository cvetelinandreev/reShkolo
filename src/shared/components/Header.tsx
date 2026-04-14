import { Link } from "wasp/client/router";
import Logo from "../../assets/logo.svg";

export function Header() {
  return (
    <header className="sticky top-0 z-10 flex justify-center border-b border-neutral-200 bg-white shadow-sm">
      <div className="flex w-full max-w-(--breakpoint-lg) items-center justify-between p-4 px-12">
        <Link to="/" className="flex items-center gap-2">
          <img src={Logo} alt="reShkolo" className="h-10 w-10" />
          <h1 className="text-2xl font-semibold">reShkolo</h1>
        </Link>
      </div>
    </header>
  );
}
