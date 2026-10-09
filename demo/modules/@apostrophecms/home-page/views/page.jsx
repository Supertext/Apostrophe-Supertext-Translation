// The demo's home page: the page title and its `main` area (translated like any other
// page), plus a sign-in hint for visitors.

export default function ({ page, user }, { Extend, Area }) {
  return (
    <Extend
      templateName="layout.jsx"
      main={
        <section className="bp-welcome">
          <h1 className="bp-welcome__headline">{page.title}</h1>
          <div className="bp-welcome__area">
            <Area doc={page} name="main" />
          </div>
          {!user && (
            <p className="bp-welcome__cta">
              <a className="bp-button bp-button--cta" href="/login">Log in</a>
            </p>
          )}
        </section>
      }
    />
  );
}
