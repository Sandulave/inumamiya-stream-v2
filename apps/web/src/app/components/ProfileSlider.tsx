"use client";

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { profileGallery } from '../../data/streamerData';

type Props = {
  initialImage?: string;
};

export default function ProfileSlider({ initialImage }: Props) {
  const dragRef = useRef<HTMLDivElement | null>(null);
  const autoRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startTranslateRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const dragEl = dragRef.current;
    const autoEl = autoRef.current;
    if (!dragEl || !autoEl) return;
    const d = dragEl as HTMLDivElement;
    const a = autoEl as HTMLDivElement;

    function getTranslateX(el: HTMLElement) {
      const s = window.getComputedStyle(el);
      const t = s.transform || 'none';
      if (t === 'none') return 0;
      const m = t.match(/matrix\(([-0-9., ]+)\)/);
      if (m) {
        const parts = m[1].split(',').map((p) => parseFloat(p));
        return parts[4] || 0;
      }
      const m3d = t.match(/matrix3d\(([-0-9., ]+)\)/);
      if (m3d) {
        const parts = m3d[1].split(',').map((p) => parseFloat(p));
        return parts[12] || 0;
      }
      return 0;
    }

    function onPointerDown(e: PointerEvent) {
      // only left button
      if (e.button !== 0) return;
      pointerIdRef.current = e.pointerId;
      d.setPointerCapture(e.pointerId);
      startXRef.current = e.clientX;
      startTranslateRef.current = getTranslateX(d as HTMLElement);
      setIsDragging(true);
      d.classList.add('dragging');
      // pause auto animation while dragging
      a.style.animationPlayState = 'paused';
      // prevent image dragging
      document.body.style.userSelect = 'none';
    }

    function onPointerMove(e: PointerEvent) {
      if (pointerIdRef.current !== e.pointerId || !isDragging) return;
      const dx = e.clientX - startXRef.current;
      const newTx = startTranslateRef.current + dx;
      d.style.transform = `translateX(${newTx}px)`;
      // decide to prevent vertical scrolling when horizontal dragged sufficiently
      if (Math.abs(dx) > 10) {
        e.preventDefault();
      }
    }

    function endDrag(e: PointerEvent) {
      if (pointerIdRef.current !== e.pointerId) return;
      try {
        d.releasePointerCapture(e.pointerId);
      } catch {}
      pointerIdRef.current = null;
      setIsDragging(false);
      d.classList.remove('dragging');
      document.body.style.userSelect = '';
      // leave the dragEl transform as-is so position persists
      // if viewport is hovered, resume auto animation
      // note: :hover CSS will also resume; ensure it is allowed
    }

    dragEl.addEventListener('pointerdown', onPointerDown, { passive: false });
    const onPointerMoveWindow = (ev: Event) => onPointerMove(ev as PointerEvent);
    const onPointerUpWindow = (ev: Event) => endDrag(ev as PointerEvent);
    const onPointerCancelWindow = (ev: Event) => endDrag(ev as PointerEvent);

    window.addEventListener('pointermove', onPointerMoveWindow, { passive: false });
    window.addEventListener('pointerup', onPointerUpWindow);
    window.addEventListener('pointercancel', onPointerCancelWindow);

    return () => {
      dragEl.removeEventListener('pointerdown', onPointerDown as EventListener);
      window.removeEventListener('pointermove', onPointerMoveWindow);
      window.removeEventListener('pointerup', onPointerUpWindow);
      window.removeEventListener('pointercancel', onPointerCancelWindow);
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  // Build sequence with initial image at front
  const seq = initialImage
    ? [{ alt: 'Twitch プロフィール', src: initialImage }, ...profileGallery]
    : profileGallery;
  const items = seq.concat(seq);

  return (
    <div className="profileSliderViewport">
      <div
        className={`profileSliderDrag ${isDragging ? 'dragging' : ''}`}
        ref={dragRef}
        // prevent accidental image drag
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="profileSliderAutoTrack" ref={autoRef}>
          {items.map((image, idx) => (
            <div key={`${image.src}-${idx}`} className="profileSliderItem">
              <div className="galleryImageWrapper">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 220px"
                  style={{ objectFit: 'cover', userSelect: 'none' }}
                  draggable={false}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
