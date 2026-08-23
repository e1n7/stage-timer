'use client';

import dynamic from 'next/dynamic';

const TimerOutput = dynamic(() => import('../../src/components/TimerOutput').then((module) => module.TimerOutput), {
  ssr: false,
});

export default function OutputPage() {
  return <TimerOutput />;
}
