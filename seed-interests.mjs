// Seed the collector interest profiles into MongoDB
// Run once: node seed-interests.mjs
// Safe to re-run — drops and recreates
import { loadEnv } from './src/env.mjs';
loadEnv();

import { connectDB, disconnectDB } from './src/db.mjs';
import Interest from './src/models/Interest.mjs';
import { getInterestsAsPrompt, getInterestsSummary } from './src/interests.mjs';

const interests = [
  {
    name: 'Vintage Cast Iron Cookware',
    priority: 'high',
    directMatches: [
      'Griswold', 'Wagner Ware', 'Wagner', 'Erie',
      'Favorite Piqua', 'Wapak', 'Sidney',
      'Birmingham Stove',
    ],
    semanticMatches: [
      'cast iron skillet', 'cast iron dutch oven', 'cast iron griddle',
      'cast iron waffle iron', 'corn stick pan', 'gem pan',
      'cast iron muffin pan', 'spider pan', 'scotch bowl',
    ],
    watchFor: [
      'heat ring', 'gate mark', 'slant logo', 'block logo',
      'pattern number', '#3', '#4', '#5', '#6', '#7', '#8', '#9', '#10', '#11', '#12', '#13', '#14',
      'Erie PA', 'Sidney O', 'small logo', 'large logo',
      'smoke ring', 'raised lettering',
    ],
    avoid: [
      'reproduction', 'made in China', 'Lodge new', 'modern',
      'cast iron patio', 'cast iron fence', 'cast iron radiator',
      'wrought iron', 'doorstop', 'cast iron gate',
    ],
    notes: `Vintage and antique cast iron cookware is highly collectible. The most prized makers are Griswold (Erie, PA) and Wagner Ware (Sidney, OH).

Key collector knowledge:
- "Griswold #8 Erie PA" is a cast iron skillet — the word "skillet" may not appear.
- Pattern numbers (#3-#14) indicate size. #8 is most common; very small (#1-#2) and very large (#13-#14) are rare and valuable.
- "Erie" alone on a piece predates the Griswold name and is MORE valuable.
- "Slant logo" vs "block logo" refer to Griswold eras. Slant/Erie = earlier = more valuable.
- Heat rings on the bottom indicate pre-1930s manufacture.
- Gate marks (raised line on bottom) indicate 1800s manufacture — very desirable.
- Wagner Ware, Sidney O is the second most collected brand. "-Sidney-" with dashes = older mark.
- Condition: cracks kill value, but rust and grime do not (they clean up).
- "Unmarked" pieces with features suggesting pre-1960s manufacture are also interesting.
- Griswold also made gem pans, muffin pans, corn stick pans, and waffle irons.`,
  },
  {
    name: 'Vintage Toys (1970s-80s)',
    priority: 'high',
    directMatches: [
      'Star Wars', 'Kenner', 'Mego',
      'Six Million Dollar Man', 'Bionic',
      'Evel Knievel', 'Micronauts',
      'He-Man', 'Masters of the Universe', 'MOTU',
      'Transformers', 'GoBots', 'Voltron',
      'GI Joe', 'Big Jim',
      'Planet of the Apes', 'Star Trek',
      'Shogun Warriors',
    ],
    semanticMatches: [
      'vintage action figure', 'vintage action figures',
      '1970s toy', '1980s toy', 'vintage toy lot',
      'action figure lot vintage',
      'toy collection 1970s', 'toy collection 1980s',
      'retro action figure',
    ],
    watchFor: [
      'original card', 'carded', 'MOC', 'MIB', 'mint in box',
      'complete', 'with weapons', 'with accessories',
      '12-back', '20-back', '21-back',
      'cloth outfit', '8 inch figure',
      'Redline', 'Hot Wheels Redline',
      'Atari', 'Intellivision',
      'Lesney', 'Matchbox',
      'pressed steel', 'Tonka',
    ],
    avoid: [
      'modern', 'reissue', 'reproduction', 'replica',
      'Black Series', 'Marvel Legends new', 'current',
      'Fisher Price baby', 'Nerf', 'new in box 2020',
      'stuffed animal', 'plush',
    ],
    notes: `Focused on toys from the 1970s and early 1980s — the collector sweet spot.

Key collector knowledge:
- Star Wars (Kenner, 1977-1985): Action figures, vehicles, playsets. Loose figures with weapons are collectible. Carded (on original card) figures are very valuable. Early figures (1977-78 "12-back") are most desirable.
- Mego action figures (1971-1983): 8-inch figures with cloth outfits. Super Heroes (Batman, Superman, Spider-Man), Star Trek, Planet of the Apes, Wizard of Oz, KISS. Mego is VERY collectible — even loose figures have good value.
- Other key 1970s-80s lines: Six Million Dollar Man/Bionic Woman (Kenner), Evel Knievel (Ideal), Micronauts (Mego), Big Jim (Mattel), Shogun Warriors.
- Early 1980s: He-Man/Masters of the Universe, Transformers G1, GoBots, Voltron.
- Die-cast: Hot Wheels Redline era (1968-1977) most valuable, Matchbox Lesney era, Corgi.
- Pressed steel trucks: Tonka from the 1970s, especially large ones.
- Early video games: Atari 2600, Intellivision — consoles and games.
- Condition and original packaging dramatically increase value, but even beat-up 1970s toys have collector interest.
- "Lot of vintage toys" from estate sales often contain hidden gems from this era.`,
  },
  {
    name: 'Comic Books',
    priority: 'high',
    directMatches: [
      'comic book', 'comic books', 'comics lot',
      'Marvel', 'DC Comics',
      'Spider-Man', 'Batman', 'Superman', 'X-Men',
      'Amazing Fantasy', 'Action Comics', 'Detective Comics',
      'CGC', 'CBCS',
    ],
    semanticMatches: [
      'vintage comics', 'comic collection', 'box of old comics',
      'Silver Age comics', 'Golden Age comics', 'Bronze Age comics',
      'estate comic books', 'comic book lot',
    ],
    watchFor: [
      'first appearance', '1st appearance', 'key issue', 'origin issue',
      'Silver Age', 'Golden Age', 'Bronze Age',
      '#1', 'issue 1', 'first issue',
      'graded', 'slabbed', 'CGC', 'CBCS',
      'near mint', 'very fine', 'fine', 'NM', 'VF',
      'Hulk 181', 'Amazing Fantasy 15', 'Giant Size X-Men',
    ],
    avoid: [
      'trade paperback', 'TPB', 'graphic novel new',
      'manga current', 'modern reprint',
      'comic storage boxes empty', 'comic bags and boards',
    ],
    notes: `Comic books are collectible across several eras:

Key collector knowledge:
- Golden Age (1938-1956): Action Comics, Detective Comics, Captain America. Extremely valuable in any condition.
- Silver Age (1956-1970): Amazing Spider-Man, Fantastic Four, X-Men, Avengers. Key first appearances are highly sought.
- Bronze Age (1970-1985): Still very collectible, especially first appearances (Wolverine in Hulk #181, Punisher in ASM #129).
- Key issues: First appearances, first issues, death issues command premiums.
- CGC/CBCS graded comics (slabbed in plastic cases with grades) have verified condition.
- Lots and collections are interesting — a "box of old comics" from an estate could contain keys.
- Underground/indie comics (R. Crumb, early TMNT) have niche value.
- Even coverless Golden Age comics have value.
- Comic art, original pages, and signed comics are also collectible.`,
  },
];

async function seed() {
  await connectDB();

  // Drop existing interests and recreate
  await Interest.deleteMany({});
  console.log('Cleared existing interests.\n');

  console.log('Seeding interest profiles...\n');
  for (const data of interests) {
    await Interest.create(data);
    console.log(`  Created: ${data.name} (${data.priority})`);
    console.log(`    ${data.directMatches.length} direct, ${data.semanticMatches.length} semantic, ${data.watchFor.length} boosters, ${data.avoid.length} red flags`);
  }

  // Show the results
  console.log('\n--- Summary ---\n');
  console.log(await getInterestsSummary());

  console.log('\n--- AI Prompt Preview ---\n');
  const prompt = await getInterestsAsPrompt();
  console.log(prompt);

  await disconnectDB();
}

seed().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
