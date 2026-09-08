export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p hidden data-senga-pin-copy>
        Connexion. Entrez le PIN pour +243 •••
      </p>
      {children}
    </>
  );
}
