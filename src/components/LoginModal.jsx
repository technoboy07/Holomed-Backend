import React, { useState } from "react";

export default function LoginModal({ onLogin, onClose, API_BASE }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // Login
        const formData = new FormData();
        formData.append('username', email); // FastAPI OAuth2 uses 'username' field
        formData.append('password', password);

        const response = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          onLogin(data.access_token, data.user);
        } else {
          const errorData = await response.json();
          setError(errorData.detail || "Login failed");
        }
      } else {
        // Register
        const response = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            username: username || email.split('@')[0],
            password
          })
        });

        if (response.ok) {
          const userData = await response.json();
          // After registration, automatically log in
          const loginFormData = new FormData();
          loginFormData.append('username', email);
          loginFormData.append('password', password);

          const loginResponse = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            body: loginFormData
          });

          if (loginResponse.ok) {
            const loginData = await loginResponse.json();
            onLogin(loginData.access_token, loginData.user);
          } else {
            setError("Registration successful. Please log in.");
            setIsLogin(true);
          }
        } else {
          const errorData = await response.json();
          setError(errorData.detail || "Registration failed");
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError("Failed to connect to server. Please check if the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        background: '#1b263b',
        padding: '40px',
        borderRadius: '8px',
        width: '400px',
        maxWidth: '90%',
        border: '1px solid #415a77'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#00b4d8' }}>
          {isLogin ? 'Login to HoloMed' : 'Create Account'}
        </h2>

        {error && (
          <div style={{
            background: 'rgba(255, 0, 0, 0.2)',
            color: '#ff6b6b',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '20px',
            border: '1px solid #ff6b6b'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#e0e1dd' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px',
                background: '#0d1b2a',
                border: '1px solid #415a77',
                borderRadius: '4px',
                color: '#e0e1dd',
                fontSize: '14px'
              }}
            />
          </div>

          {!isLogin && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#e0e1dd' }}>
                Username (optional)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0d1b2a',
                  border: '1px solid #415a77',
                  borderRadius: '4px',
                  color: '#e0e1dd',
                  fontSize: '14px'
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#e0e1dd' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px',
                background: '#0d1b2a',
                border: '1px solid #415a77',
                borderRadius: '4px',
                color: '#e0e1dd',
                fontSize: '14px'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#415a77' : '#00b4d8',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '15px'
            }}
          >
            {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <div style={{ textAlign: 'center', color: '#778da9' }}>
          {isLogin ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => {
                  setIsLogin(false);
                  setError("");
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#00b4d8',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setIsLogin(true);
                  setError("");
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#00b4d8',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
