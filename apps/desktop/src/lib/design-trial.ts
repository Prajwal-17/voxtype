import { useLayoutEffect, useState } from 'react';

export const designs = [
  {
    id: 'studio',
    name: 'Studio',
    note: 'Charcoal & lime · A focused creative workspace',
    colors: ['#171b19', '#303730', '#d3ef87'],
    title: 'Give your ideas a voice.',
    eyebrow: 'YOUR PERSONAL VOICE STUDIO',
  },
  {
    id: 'field',
    name: 'Field Notes',
    note: 'Parchment & pine · An editorial writing desk',
    colors: ['#e9e3d3', '#234b3c', '#ad794b'],
    title: 'A little less typing.\nA little more thinking.',
    eyebrow: 'A QUIET PLACE FOR YOUR WORDS',
  },
  {
    id: 'signal',
    name: 'Signal',
    note: 'Midnight & blue · A precise recording console',
    colors: ['#101829', '#263754', '#9ebeff'],
    title: 'Thought → text.',
    eyebrow: 'VOICE CAPTURE / WORKSPACE 01',
  },
  {
    id: 'clay',
    name: 'Tide',
    note: 'Mineral & petrol · A calm desktop workspace',
    colors: ['#dce6e5', '#155e63', '#bfd3cf'],
    title: 'Make room for your thoughts.',
    eyebrow: 'LESS FRICTION. MORE FLOW.',
  },
] as const;

export type Design = (typeof designs)[number];
const storageKey = 'voxtype-desktop-design-trial';

export function useDesignTrial() {
  const [design, setDesign] = useState<Design>(() => {
    const query = new URLSearchParams(window.location.search).get('design');
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {
      /* Storage is optional. */
    }
    return designs.find((item) => item.id === (query ?? saved)) ?? designs[0];
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.design = design.id;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const originalIcon = favicon?.getAttribute('href') ?? '/voxtype.svg';
    favicon?.setAttribute('href', design.id === 'clay' ? '/voxtype-tide.svg' : '/voxtype.svg');
    try {
      localStorage.setItem(storageKey, design.id);
    } catch {
      /* Keep the trial usable without storage. */
    }
    return () => {
      delete document.documentElement.dataset.design;
      favicon?.setAttribute('href', originalIcon);
    };
  }, [design]);
  return { design, setDesign };
}
