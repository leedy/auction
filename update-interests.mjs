// One-time update: remove collectibles category, refine vintage toys
import { loadEnv } from './src/env.mjs';
loadEnv();

import { connectDB, disconnectDB } from './src/db.mjs';
import { removeInterest, updateInterest } from './src/interests.mjs';
import { getInterestsSummary } from './src/interests.mjs';

async function main() {
  await connectDB();

  // Remove the medium-priority catch-all
  console.log('Removing "Antique & Vintage Collectibles"...');
  await removeInterest('Antique & Vintage Collectibles');

  // Refine Vintage Toys to focus on 1970s-early 80s, Star Wars, Mego
  console.log('\nUpdating "Vintage Toys"...');
  await updateInterest('Vintage Toys', {
    directMatches: [
      'Star Wars', 'Kenner', 'Mego', 'action figure', 'action figures',
      'GI Joe', 'Six Million Dollar Man', 'Bionic', 'Evel Knievel',
      'Micronauts', 'Shogun Warriors', 'Fisher Price Adventure People',
      'Big Jim', 'Ertl', 'Matchbox', 'Hot Wheels', 'Corgi',
      'Tonka', 'Marx', 'Mattel', 'Hasbro', 'Ideal',
      'He-Man', 'MOTU', 'Masters of the Universe',
      'Transformers', 'GoBots', 'Voltron',
      'Atari', 'Intellivision', 'video game',
      'Star Trek', 'Planet of the Apes', 'Super Heroes',
      'Mego 8 inch', 'vintage toy', 'vintage toys',
      '1970s', '1980s', 'tin toy', 'wind-up',
    ],
    semanticMatches: [
      'retro action figures from the late 70s or early 80s',
      'classic sci-fi toy lines from the original trilogy era',
      'die-cast vehicles from the pre-1980 era',
      'estate sale toy lots that may contain vintage items',
    ],
    watchFor: [
      'original packaging', 'carded figure', 'with box', 'complete',
      'Redline', 'Lesney', '12-back', 'first edition',
    ],
    avoid: [
      'modern reproduction', 'reissue', 'Black Series', 'current LEGO',
      'baby toy', 'Nerf', 'stuffed animal', '2020', '2021', '2022', '2023', '2024', '2025',
    ],
    notes: `Focused on toys from the 1970s and early 1980s — the collector's sweet spot.

- Star Wars (Kenner, 1977-1985): Action figures, vehicles, playsets. Loose figures with weapons are collectible. Carded (on original card) figures are very valuable. Look for: "Star Wars figures," "Kenner Star Wars," "Empire Strikes Back," "Return of the Jedi." Early figures (1977-78 "12-back") are most desirable.
- Mego action figures (1971-1983): 8-inch figures with cloth outfits. Super Heroes (Batman, Superman, Spider-Man), Star Trek, Planet of the Apes, Wizard of Oz, KISS. Mego is VERY collectible. Even loose figures have good value. Look for "Mego" or "8 inch action figure" from this era.
- Other key 1970s-80s action figures: Six Million Dollar Man/Bionic Woman (Kenner), Evel Knievel (Ideal), Micronauts (Mego), Big Jim (Mattel), Fisher-Price Adventure People.
- Early 1980s lines: He-Man/Masters of the Universe, Transformers G1, GoBots, Voltron. These overlap with Star Wars era collecting.
- Die-cast vehicles: Hot Wheels (Redline era 1968-1977 most valuable), Matchbox (Lesney era), Corgi, Ertl.
- Pressed steel trucks from the 1970s: Tonka, especially large ones in good condition.
- Early video games: Atari 2600, Intellivision — consoles and games.
- Condition and original packaging/boxes dramatically increase value. Even beat-up 1970s toys have collector interest.
- "Lot of vintage toys" type listings from estate sales often contain 1970s-80s items.`,
  });

  console.log('\n--- Updated Summary ---\n');
  console.log(await getInterestsSummary());

  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
