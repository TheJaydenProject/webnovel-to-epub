// Best-effort fallback for locating a chapter's content container when no
// configured `bodySelector` matches (an unlisted site, or a listed one whose
// markup changed). Scores each paragraph's parent and grandparent - the
// grandparent catches the common "each paragraph wrapped in its own
// container" pattern (e.g. <div class="paragraph"><p>...</p></div>) where no
// single parent holds more than one paragraph.
//
// ponytail: this is a single-pass version of the paragraph-scoring idea
// behind Mozilla's Readability algorithm, without its link-density penalty,
// boilerplate class/id scoring, or iterative candidate expansion. Ceiling:
// can be misled by another prose-heavy region on the page (e.g. a long
// comments section) or content nested more than two levels deep. Upgrade
// path: add a link-density penalty and negative scoring for nav/sidebar/
// comment class-name patterns if this proves insufficient in practice.
export function findLikelyContentElement(doc) {
  const scores = new Map(); // element -> score

  for (const p of doc.querySelectorAll("p")) {
    const text = p.textContent.trim();
    if (text.length < 25) continue; // skip short/boilerplate paragraphs
    const points = 1 + text.split(/\s+/).length;

    const parent = p.parentElement;
    if (parent) scores.set(parent, (scores.get(parent) || 0) + points);

    const grandparent = parent?.parentElement;
    if (grandparent) scores.set(grandparent, (scores.get(grandparent) || 0) + points * 0.5);
  }

  let best = null;
  let bestScore = 0;
  for (const [el, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}
