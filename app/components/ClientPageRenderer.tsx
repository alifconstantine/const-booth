'use client';

import React, { useEffect, useRef } from 'react';

interface ClientPageRendererProps {
  html: string;
  styles?: string[];
  bodyClass?: string;
  bodyAttrs?: Record<string, string>;
}

export default function ClientPageRenderer({
  html,
  styles = [],
  bodyClass = '',
  bodyAttrs = {}
}: ClientPageRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Apply body class
    const addedClasses: string[] = [];
    if (bodyClass) {
      bodyClass.split(/\s+/).forEach((cls) => {
        if (cls && !document.body.classList.contains(cls)) {
          document.body.classList.add(cls);
          addedClasses.push(cls);
        }
      });
    }

    // Apply body attributes
    const originalAttrs: Record<string, string | null> = {};
    Object.entries(bodyAttrs).forEach(([k, v]) => {
      originalAttrs[k] = document.body.getAttribute(k);
      document.body.setAttribute(k, v);
    });

    // Make sure body is visible
    document.body.style.opacity = '1';

    let isCancelled = false;

    // Safety watchdog: never allow global loader to stay stuck for more than 2.5 seconds
    const safetyLoaderTimer = setTimeout(() => {
      try {
        if (typeof (window as any).hideLoader === 'function') {
          (window as any).hideLoader();
        }
        const loader = document.getElementById('lensbooth-global-loader');
        if (loader) {
          loader.classList.remove('visible');
        }
      } catch (_e) {}
    }, 2500);

    // Execute scripts found within the rendered HTML
    if (containerRef.current) {
      const scriptElements = Array.from(containerRef.current.querySelectorAll('script'));

      async function executeScripts() {
        for (const oldScript of scriptElements) {
          if (isCancelled) break;

          // Skip JSON-LD scripts
          if (oldScript.type === 'application/ld+json') continue;

          await new Promise<void>((resolve) => {
            const newScript = document.createElement('script');

            // Copy attributes
            Array.from(oldScript.attributes).forEach((attr) => {
              if (attr.name !== 'src' && attr.name !== 'async' && attr.name !== 'defer') {
                newScript.setAttribute(attr.name, attr.value);
              }
            });

            if (oldScript.src) {
              newScript.src = oldScript.src;
              newScript.async = false;
              newScript.onload = () => resolve();
              newScript.onerror = () => resolve();
              oldScript.parentNode?.replaceChild(newScript, oldScript);
            } else {
              newScript.textContent = oldScript.textContent;
              oldScript.parentNode?.replaceChild(newScript, oldScript);
              resolve();
            }
          });
        }

        if (!isCancelled) {
          // Trigger initialization events
          setTimeout(() => {
            document.dispatchEvent(new Event('DOMContentLoaded'));
            window.dispatchEvent(new Event('load'));

            if (typeof (window as any).__lbCenterStrips === 'function') {
              (window as any).__lbCenterStrips(true);
            }
            if (typeof (window as any).__lbStartCamera === 'function') {
              (window as any).__lbStartCamera();
            }
          }, 80);
        }
      }

      executeScripts();
    }

    return () => {
      isCancelled = true;
      clearTimeout(safetyLoaderTimer);
      addedClasses.forEach((cls) => document.body.classList.remove(cls));
      Object.entries(originalAttrs).forEach(([k, orig]) => {
        if (orig === null) {
          document.body.removeAttribute(k);
        } else {
          document.body.setAttribute(k, orig);
        }
      });
    };
  }, [html, bodyClass, bodyAttrs]);

  return (
    <>
      {styles.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ display: 'contents' }}
      />
    </>
  );
}
