export default function SiteFooter() {
  return (
    <footer className="border-t bg-background/70">
      <div className="container py-8 text-sm text-muted-foreground">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <p>
            © {new Date().getFullYear()} MVP + Python Studio — We integrate your Python into a beautiful product.
          </p>
          <p className="space-x-3">
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href="https://www.builder.io/c/docs/projects-github"
              target="_blank"
              rel="noreferrer"
            >
              Connect a GitHub repo
            </a>
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href="https://www.builder.io/c/docs/projects-vscode"
              target="_blank"
              rel="noreferrer"
            >
              Use our VS Code extension
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
