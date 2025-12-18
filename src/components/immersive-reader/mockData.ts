import { Book } from './types';

export const MOCK_BOOKS: Book[] = [
  {
    id: 1,
    title: 'The Last Horizon',
    author: 'by Alistair Thorne',
    coverColor: 'bg-gradient-to-br from-slate-700 to-slate-900',
    progress: 65,
    chapters: [
      {
        id: 'ch1',
        title: 'Introduction',
        content: `<h1>Introduction</h1>
        <p>The world as we knew it had changed forever. The sky, once a canvas of blue and white, now bore streaks of amber and crimson, a constant reminder of the transformation that had swept across our reality.</p>
        <p>In the beginning, we thought it was temporary—a strange atmospheric phenomenon that scientists would soon explain away with their complex equations and reassuring press conferences. But as days turned into weeks, and weeks into months, we realized this was our new normal.</p>
        <p>This is the story of survival, of adaptation, and of the human spirit's remarkable ability to find hope even in the darkest of times.</p>`
      },
      {
        id: 'ch2',
        title: 'Chapter 1: The Awakening',
        content: `<h1>Chapter 1: The Awakening</h1>
        <p>I woke to the sound of sirens. Not the familiar wail of emergency vehicles, but something deeper, more resonant—a sound that seemed to vibrate through the very foundations of the building.</p>
        <p>Sarah was already at the window, her silhouette backlit by the strange orange glow that had become our morning light. "You need to see this," she said, her voice barely above a whisper.</p>
        <p>What I saw through that window would change everything. The horizon was no longer a distant line where earth met sky, but a shimmering boundary between our world and something else entirely—something magnificent and terrifying in equal measure.</p>`
      },
      {
        id: 'ch3',
        title: 'Chapter 2: Twosizing',
        content: `<h1>Chapter 2: Twosizing</h1>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
        <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
        <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>`
      },
      {
        id: 'ch4',
        title: 'Chapter 3: The Jearny Begine',
        content: `<h1>Chapter 3: The Journey Begins</h1>
        <p>The decision to leave wasn't easy. Everything we'd known, everyone we'd loved—it all remained behind those walls. But staying meant certain death, and leaving at least offered a chance, however slim.</p>
        <p>We packed light: food, water, medical supplies, and the few personal items that still held meaning in this new world. Sarah insisted on bringing her grandmother's locket, and I couldn't argue with that small comfort.</p>`
      },
      {
        id: 'ch5',
        title: 'Tist texts Cind Road',
        content: `<h1>The Winding Road</h1>
        <p>Our journey took us through landscapes that seemed alien and familiar at once. The roads we'd traveled countless times before now twisted through territories transformed by the changes sweeping across our world.</p>`
      },
      {
        id: 'ch6',
        title: 'The Hisharian',
        content: `<h1>The Historian</h1>
        <p>We met him in what remained of the old university library. Dr. Marcus Chen, professor emeritus of theoretical physics, had spent the last months documenting everything—the changes, the patterns, the inexplicable phenomena that defied every law of nature we'd once held sacred.</p>`
      }
    ]
  },
  {
    id: 2,
    title: 'Echos of the Forgotten',
    author: 'by Alistair Thorne',
    coverColor: 'bg-gradient-to-br from-blue-700 to-blue-900',
    progress: 43,
    chapters: [
      {
        id: 'ch1',
        title: 'Prologue',
        content: `<h1>Prologue</h1>
        <p>Memory is a curious thing. It shapes us, defines us, and yet it can be as unreliable as smoke in the wind. This is a story about memories—lost, found, and sometimes better left forgotten.</p>`
      },
      {
        id: 'ch2',
        title: 'Chapter 1: The First Echo',
        content: `<h1>Chapter 1: The First Echo</h1>
        <p>The photograph was old, its edges yellowed and worn. But it was the faces that caught my attention—familiar yet strange, like looking at reflections in troubled water.</p>`
      }
    ]
  },
  {
    id: 3,
    title: 'The Crimson Path',
    author: 'by Elena Voss',
    coverColor: 'bg-gradient-to-br from-red-700 to-red-900',
    progress: 12,
    chapters: [
      {
        id: 'ch1',
        title: 'Part I: Beginnings',
        content: `<h1>Part I: Beginnings</h1>
        <p>Every journey begins with a single step, they say. Mine began with a single drop of blood on fresh snow.</p>`
      }
    ]
  }
];

