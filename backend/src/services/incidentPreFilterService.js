const INCIDENT_SIGNAL =
  /\b(?:killed|shot|stabbed|arrested|robbery|robbed|assault|attacked|injured|victim|theft|vandalism|suspect|shooting|missing person|police arrest)\b/i;

const GENERAL_NEWS_PATTERNS = [
  /\b(?:policy announcement|policy announcements|announces? a new policy|new government policy|policy update)\b/i,
  /\b(?:elections?|campaign rally|voting begins|candidate filing)\b/i,
  /\b(?:no winners? of .* lotto games?|lotto games?|lottery results?|lottery jackpot)\b/i,
  /\b(?:weather forecast|weather advisory|forecast for|heat index(?: forecast)?|rainfall advisory|typhoon update|storm forecast|class suspensions due to weather)\b/i,
  /\b(?:fake .*class suspension announcement|class suspension announcement|nationwide class suspension announcement)\b/i,
  /\b(?:education programs?|school programs?|scholarship programs?|curriculum update|school enrollment|world teachers['’]? day)\b/i,
  /\b(?:political statement|statement on (?:the )?(?:administration|policy|election)|politician says|lawmakers? push for (?:programs?|funds?|funding))\b/i,
  /\b(?:infrastructure project|airport project|road project|bridge project|construction project|groundbreaking ceremony)\b/i,
  /\b(?:public advisories?|general advisories?|traffic advisories?|water service advisories?)\b/i,
  /\b(?:opinion|editorial|commentary|op-ed)\b/i,
];

function isPlausibleIndividualIncident(article = {}) {
  const title = typeof article.title === "string" ? article.title : "";
  const content = typeof article.content === "string" ? article.content : "";
  const text = `${title}\n${content}`;

  if (INCIDENT_SIGNAL.test(text)) return true;
  if (GENERAL_NEWS_PATTERNS.some((pattern) => pattern.test(text))) return false;

  return true;
}

module.exports = {
  isPlausibleIndividualIncident,
};
