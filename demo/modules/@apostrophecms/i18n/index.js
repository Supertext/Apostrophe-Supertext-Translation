export default {
  options: {
    defaultLocale: 'en',
    // Slugs without accents ("expedie", not "expédié"), also for Supertext's translated slugs.
    stripUrlAccents: true,
    locales: {
      en: { label: 'English' },
      de: { label: 'Deutsch', prefix: '/de' },
      fr: { label: 'Français', prefix: '/fr' },
      it: { label: 'Italiano', prefix: '/it' }
    }
  }
};
