import React from 'react';

export default function About() {
  return (
    <div style={{ minHeight: '100vh', padding: '4rem 2rem', backgroundColor: '#f9fafb' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1rem' }}>
            About LEQVOR
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#4b5563' }}>
            Securing your family's digital legacy, one encrypted document at a time.
          </p>
        </div>

        {/* Mission Section */}
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.5rem', marginBottom: '2rem', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
            Our Mission
          </h2>
          <p style={{ color: '#374151', lineHeight: '1.75', marginBottom: '1rem' }}>
            In an increasingly digital world, our most important documents—wills, property deeds, 
            insurance policies, and family records—are scattered across devices and cloud services. 
            LEQVOR was built to solve this problem with a simple, uncompromising principle: 
            <strong> your data belongs to you, and only you.</strong>
          </p>
          <p style={{ color: '#374151', lineHeight: '1.75' }}>
            We provide a zero-knowledge, client-side encrypted vault that ensures your sensitive 
            information remains private, secure, and accessible to the people you trust, exactly 
            when they need it.
          </p>
        </div>

        {/* Security Promise Section */}
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.5rem', marginBottom: '2rem', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
            Our Security Promise
          </h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem', color: '#374151' }}>
              <span style={{ color: '#2563eb', marginRight: '0.75rem', fontSize: '1.25rem' }}>🔒</span>
              <span><strong>Zero-Knowledge Architecture:</strong> Your Vault Master Key is generated and stays on your device. We physically cannot read your data.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem', color: '#374151' }}>
              <span style={{ color: '#2563eb', marginRight: '0.75rem', fontSize: '1.25rem' }}>🛡️</span>
              <span><strong>Asymmetric Defense:</strong> Built with strict network segmentation and tamper-evident audit logs to prevent unauthorized access.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', color: '#374151' }}>
              <span style={{ color: '#2563eb', marginRight: '0.75rem', fontSize: '1.25rem' }}>🤝</span>
              <span><strong>Controlled Sharing:</strong> Grant time-bound, revocable access to family members or legal professionals without compromising your master key.</span>
            </li>
          </ul>
        </div>

        {/* Founder Note */}
        <div style={{ backgroundColor: '#eff6ff', borderLeft: '4px solid #2563eb', padding: '1.5rem', borderRadius: '0 0.5rem 0.5rem 0' }}>
          <p style={{ color: '#1f2937', fontStyle: 'italic', marginBottom: '1rem' }}>
            "LEQVOR was founded with a single goal: to make enterprise-grade digital security 
            accessible and understandable for everyday families planning their legacy."
          </p>
          <p style={{ color: '#111827', fontWeight: '600' }}>— The LEQVOR Team</p>
        </div>

        {/* Back to Home Button */}
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <a 
            href="/" 
            style={{ 
              display: 'inline-block', 
              backgroundColor: '#2563eb', 
              color: 'white', 
              fontWeight: '600', 
              padding: '0.75rem 2rem', 
              borderRadius: '0.5rem', 
              textDecoration: 'none',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
          >
            Return to Homepage
          </a>
        </div>
      </div>
    </div>
  );
}