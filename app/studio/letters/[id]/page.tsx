'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface LetterData {
  id: string;
  paper: string;
  pages: string[];
  createdAt: number;
}

export default function LetterViewerPage() {
  const params = useParams();
  const id = params?.id as string;
  const [letter, setLetter] = useState<LetterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/letters?id=${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Letter not found');
        return res.json();
      })
      .then((data) => {
        setLetter(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load letter');
        setLoading(false);
      });
  }, [id]);

  const downloadPage = (dataUrl: string, index: number) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `constbooth-letter-p${index + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#EAE6DF',
      color: '#111',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-main, "Satoshi", sans-serif)'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        backgroundColor: '#fff'
      }}>
        <Link href="/studio/letters" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <img src="/assets/logo.svg" alt="ConstBooth" width={112} height={30} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#666', borderLeft: '1px solid #ddd', paddingLeft: '8px' }}>
            Letters
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/studio/letters"
            style={{
              padding: '8px 16px',
              borderRadius: '999px',
              backgroundColor: '#000',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Write a Letter</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px'
      }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(0,0,0,0.1)',
              borderTopColor: '#000',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ fontSize: '15px', color: '#666' }}>Opening your letter...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {error && !loading && (
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '36px 28px',
            maxWidth: '420px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Letter Not Found</h2>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
              This letter link might have expired or does not exist.
            </p>
            <Link
              href="/studio/letters"
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                borderRadius: '999px',
                backgroundColor: '#000',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              Write Your Own Letter
            </Link>
          </div>
        )}

        {letter && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '780px' }}>
            {/* Letter Page Display */}
            <div style={{
              position: 'relative',
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: '#fff',
              maxWidth: '100%',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <img
                src={letter.pages[currentPage]}
                alt={`Letter page ${currentPage + 1}`}
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  display: 'block',
                  maxHeight: '75vh',
                  objectFit: 'contain'
                }}
              />
            </div>

            {/* Pagination Controls if Multiple Pages */}
            {letter.pages.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '999px',
                    border: '1px solid #ccc',
                    backgroundColor: '#fff',
                    opacity: currentPage === 0 ? 0.4 : 1,
                    cursor: currentPage === 0 ? 'default' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                >
                  &larr; Previous Page
                </button>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#444' }}>
                  {currentPage + 1} of {letter.pages.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(letter.pages.length - 1, p + 1))}
                  disabled={currentPage === letter.pages.length - 1}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '999px',
                    border: '1px solid #ccc',
                    backgroundColor: '#fff',
                    opacity: currentPage === letter.pages.length - 1 ? 0.4 : 1,
                    cursor: currentPage === letter.pages.length - 1 ? 'default' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                >
                  Next Page &rarr;
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              justifyContent: 'center',
              marginTop: '24px'
            }}>
              <button
                type="button"
                onClick={() => downloadPage(letter.pages[currentPage], currentPage)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '999px',
                  backgroundColor: '#fff',
                  border: '1.5px solid #000',
                  color: '#000',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Save This Page</span>
              </button>
              <Link
                href="/studio/letters"
                style={{
                  padding: '10px 24px',
                  borderRadius: '999px',
                  backgroundColor: '#000',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Write a Reply</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
