// Top-level project layout. Extends Apostrophe's outerLayout — a Nunjucks
// template — through the bridge in `jsxRender.js`: each prop below becomes a
// {% block %} override on that template.
//
// Accepts these named props from page templates:
//
//   title  string used as the <title>, overriding the piece/page title
//   main   JSX node providing the page's content
//
// `data` is deliberately not destructured here. Props passed by a page
// template arrive as this template's data, so `data.main` is the `main` prop
// rather than anything belonging to the page document.

// Demo header: site name, the pages of the current locale and a language switcher
// (`data.localizations` links only to locales the page exists and is published in).
function Header({ user, home, localizations }) {
  const pages = home ? [ home, ...(home._children || []) ] : [];
  return (
    <header className="bp-header">
      <a className="bp-header__brand" href={home ? home._url : '/'}>Supertext · Apostrophe demo</a>
      <nav className="bp-nav">
        {pages.map((page) => <a href={page._url}>{page.title}</a>)}
      </nav>
      <nav className="bp-locales">
        {(localizations || []).filter((l) => l.available || l.current).map((l) => (
          l.current
            ? <strong>{l.locale.toUpperCase()}</strong>
            : <a href={l._url} hreflang={l.locale}>{l.locale.toUpperCase()}</a>
        ))}
      </nav>
      {!user && (
        <a className="bp-button bp-header__login" href="/login">Login</a>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="bp-footer">
      <p>
        Demo of <a href="https://github.com/Supertext/Apostrophe-Supertext-Translation">Supertext Translation for Apostrophe</a>.
        {' '}<a href="https://www.supertext.com">supertext.com</a>
      </p>
    </footer>
  );
}

export default function (data, { Extend, apos }) {
  // `data.title` is how a page template overrides the title — the JSX
  // equivalent of Nunjucks `{% block title %}`. Templates without a page or
  // piece in context (notFound.jsx) rely on it.
  const title = data.title ||
    (data.piece && data.piece.title) ||
    (data.page && data.page.title);

  if (!title) {
    apos.util.log('Looks like you forgot to override the title block in a template that does not have access to an Apostrophe page or piece.');
  }

  return (
    <Extend
      templateName={data.outerLayout}
      title={title}
      main={
        <div className="bp-wrapper">
          <Header user={data.user} home={data.home} localizations={data.localizations} />
          <main className="bp-main">
            {data.main}
          </main>
          <Footer />
        </div>
      }
    />
  );
}
