import { Link } from "react-router-dom";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-20 items-center justify-between">
        <Link to="/" className="flex items-center gap-3 font-extrabold text-2xl md:text-3xl">
          <span className="inline-block h-8 w-8 rounded-md bg-gradient-to-br from-primary to-accent" />
          <span>MisinforAI</span>
        </Link>
      </div>
    </header>
  );
}
