'use client';

import React, { useEffect, useRef, useId } from 'react';

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
  const executedHtmlRef = useRef<string | null>(null);
  const injectedScriptsRef = useRef<HTMLScriptElement[]>([]);
  const instanceId = useId();

  // Stable string representation of bodyAttrs to prevent dependency churn
  const bodyAttrsKey = JSON.stringify(bodyAttrs);

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
    if (bodyAttrs && typeof bodyAttrs === 'object') {
      Object.entries(bodyAttrs).forEach(([k, v]) => {
        originalAttrs[k] = document.body.getAttribute(k);
        document.body.setAttribute(k, v);
      });
    }

    // Safety watchdog: ensure global loader is hidden
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
    }, 1500);

    // Only execute scripts if this HTML has not already had its scripts executed
    if (containerRef.current && executedHtmlRef.current !== html) {
      executedHtmlRef.current = html;

      // Clean up previous injected scripts if any
      injectedScriptsRef.current.forEach((s) => {
        try {
          if (s.parentNode) s.parentNode.removeChild(s);
        } catch (_e) {}
      });
      injectedScriptsRef.current = [];

      let isCancelled = false;
      const scriptElements = Array.from(containerRef.current.querySelectorAll('script'));

      async function executeScripts() {
        for (const oldScript of scriptElements) {
          if (isCancelled) break;

          // Skip JSON-LD scripts
          if (oldScript.type === 'application/ld+json') continue;

          // Avoid loading duplicate scripts if already present globally (e.g. header.min.js)
          if (oldScript.src && oldScript.src.includes('/shared/header.min.js')) {
            continue;
          }

          await new Promise<void>((resolve) => {
            const newScript = document.createElement('script');
            newScript.setAttribute('data-client-renderer', instanceId);

            // Copy attributes except async/defer
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
              document.body.appendChild(newScript);
              injectedScriptsRef.current.push(newScript);
            } else {
              newScript.textContent = oldScript.textContent;
              document.body.appendChild(newScript);
              injectedScriptsRef.current.push(newScript);
              resolve();
            }
          });
        }

        if (!isCancelled) {
          // Trigger initialization events cleanly without global window 'load' loop
          setTimeout(() => {
            document.dispatchEvent(new Event('DOMContentLoaded'));

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
  }, [html, bodyClass, bodyAttrsKey, instanceId]);

  // Clean up injected scripts on component unmount
  useEffect(() => {
    return () => {
      injectedScriptsRef.current.forEach((s) => {
        try {
          if (s.parentNode) s.parentNode.removeChild(s);
        } catch (_e) {}
      });
      injectedScriptsRef.current = [];
    };
  }, []);

  return (
    <>
      {styles.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div
        ref={containerRef}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ display: 'contents' }}
      />
    </>
  );
}
