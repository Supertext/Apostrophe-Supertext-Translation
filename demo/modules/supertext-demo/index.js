// Supertext demo setup, run on every start (`node app supertext-demo:setup`). Only adds what
// is missing: the DEMO_ADMIN / DEMO_EDITOR accounts, the English sample pages and the sample
// article. Existing accounts and content are never changed. Passwords are never printed.

// Areas and widgets need their own ids.
const richText = (apos, content) => ({
  _id: apos.util.generateId(),
  metaType: 'area',
  items: [ {
    _id: apos.util.generateId(),
    metaType: 'widget',
    type: '@apostrophecms/rich-text',
    content
  } ]
});

const HOME = '<p>This site was written in <strong>English</strong>. Sign in to create the German, French and Italian versions with Supertext.</p>';
const CHOCOLATE = '<h2>From Bern to the world</h2><p>Every praline is made by hand in our <strong>Bern</strong> workshop. Read more on <a href="https://www.supertext.com">our website</a>.</p><ul><li>Fresh ingredients from local farmers</li><li>Climate-neutral delivery within 48 hours</li></ul>';
const ARTICLE = '<p>Every praline is filled and decorated by hand.</p><p>Our <em>tasting box</em> holds twelve of them.</p>';

export default {
  tasks(self) {
    return {
      setup: {
        usage: 'Creates the demo accounts and sample content if they are missing.',
        async task() {
          const log = (message) => console.log(`[demo] ${message}`);
          await self.ensureAccounts(log);
          await self.ensureContent(log);
        }
      }
    };
  },
  methods(self) {
    return {
      async ensureAccounts(log) {
        const req = self.apos.task.getReq();
        for (const [ prefix, role ] of [ [ 'DEMO_ADMIN', 'admin' ], [ 'DEMO_EDITOR', 'editor' ] ]) {
          const email = String(process.env[`${prefix}_EMAIL`] || '').trim().toLowerCase();
          const password = String(process.env[`${prefix}_PASSWORD`] || '');
          if (!email || !password) {
            log(`${prefix}_EMAIL / ${prefix}_PASSWORD not set; skipping that account.`);
            continue;
          }
          // Apostrophe's only rule: a password must not be empty (checked above).
          const existing = await self.apos.user.find(req, { username: email }).toObject();
          if (existing) {
            log(`${prefix}: account exists, left unchanged.`);
            continue;
          }
          try {
            await self.apos.user.insert(req, {
              username: email,
              email,
              title: role === 'admin' ? 'Demo Admin' : 'Demo Editor',
              password,
              role
            });
            log(`${prefix}: account created (${role}).`);
          } catch (e) {
            log(`WARNING: ${prefix}: account not created (${e.name || 'error'}); check ${prefix}_EMAIL and ${prefix}_PASSWORD.`);
          }
        }
      },

      async ensureContent(log) {
        const req = self.apos.task.getReq({ locale: 'en', mode: 'draft' });
        const home = await self.apos.page.find(req, { slug: '/' }).toObject();
        if (home && !(home.main && home.main.items && home.main.items.length)) {
          home.title = 'Welcome';
          home.main = richText(self.apos, HOME);
          await self.apos.page.update(req, home);
          await self.apos.page.publish(req, home);
          log('Home page content added (English).');
        }
        if (!await self.apos.page.find(req, { slug: '/swiss-chocolate' }).toObject()) {
          const page = await self.apos.page.insert(req, '_home', 'lastChild', {
            type: 'default-page',
            title: 'Swiss chocolate, shipped worldwide',
            slug: '/swiss-chocolate',
            main: richText(self.apos, CHOCOLATE)
          });
          await self.apos.page.publish(req, page);
          log('Sample page added (English).');
        }
        if (!await self.apos.modules.article.find(req, { slug: 'handmade-in-bern' }).toObject()) {
          const article = await self.apos.modules.article.insert(req, {
            title: 'Handmade in Bern',
            slug: 'handmade-in-bern',
            summary: 'How a small family business in Bern brings handmade pralines to 40 countries.',
            body: richText(self.apos, ARTICLE)
          });
          await self.apos.modules.article.publish(req, article);
          log('Sample article added (English).');
        }
      }
    };
  }
};
