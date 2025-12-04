import { useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';

function App() {
  const [message, setMessage] = useState('Hello, PixelCode!');
  const [isVisible, setIsVisible] = useState(true);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React + PixelCode</h1>

      {isVisible && (
        <div
          className="card"
          style={{
            marginTop: '1rem',
            background: '#1a1a1a',
          }}
        >
          <h3
            style={{
              marginBottom: '1rem',
              color: 'rgba(255, 255, 255, 0.87)',
            }}
          >
            {message}
          </h3>

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="message-input"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '0.5rem',
              }}
            >
              Your Message
            </label>
            <input
              id="message-input"
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{
                padding: '0.75rem 1rem',
                fontSize: '1rem',
                width: '100%',
                maxWidth: '400px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '2px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                outline: 'none',
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#22c55e';
                e.target.style.boxShadow =
                  '0 0 0 3px rgba(34, 197, 94, 0.1), 0 4px 12px rgba(0, 0, 0, 0.3)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
              }}
            />
          </div>

          <button
            onClick={() => setIsVisible(false)}
            style={{
              background: '#22c55e',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Hide This Section
          </button>
        </div>
      )}

      {!isVisible && (
        <button onClick={() => setIsVisible(true)} style={{ marginTop: '1rem' }}>
          Show Message Section
        </button>
      )}

      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
    </>
  );
}

export default App;
