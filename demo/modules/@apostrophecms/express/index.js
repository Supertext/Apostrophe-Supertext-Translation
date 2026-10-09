export default {
  options: {
    session: {
      // Railway variable APOS_SESSION_SECRET (any long random string, keep it stable).
      secret: process.env.APOS_SESSION_SECRET
    }
  }
};
