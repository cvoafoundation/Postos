/** Shared branding for public routes and the authenticated workspace. */
export function PoweredByMoxom() {
  return (
    <footer className="moxom-footer" aria-label="Powered by MOXOM">
      <div className="moxom-footer-lockup">
        <span className="moxom-footer-caption">Powered by</span>
        {/* Preserve the uploaded artwork; the viewport removes its outer padding. */}
        <svg
          className="moxom-footer-symbol"
          viewBox="530 165 1130 1190"
          aria-hidden="true"
          focusable="false"
        >
          <image href="/brand/moxom-logo.png" width="2048" height="1535" />
        </svg>
        {/* Exact Lovelo Black outlines keep the wordmark consistent on every device. */}
        <img
          className="moxom-footer-wordmark"
          src="/brand/moxom-wordmark.svg"
          alt="MOXOM"
          width="102"
          height="18"
        />
      </div>
    </footer>
  );
}
