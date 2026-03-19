/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // macOS-inspired color palette
        'mac-bg': 'rgba(30, 30, 30, 0.85)',
        'mac-bg-solid': '#1c1c1e',
        'mac-sidebar': 'rgba(45, 45, 48, 0.9)',
        'mac-panel': 'rgba(40, 40, 44, 0.95)',
        'mac-card': 'rgba(255, 255, 255, 0.08)',
        'mac-card-hover': 'rgba(255, 255, 255, 0.12)',
        'mac-border': 'rgba(255, 255, 255, 0.1)',
        'mac-border-strong': 'rgba(255, 255, 255, 0.15)',
        'accent': '#0a84ff',
        'accent-hover': '#409cff',
        'accent-muted': 'rgba(10, 132, 255, 0.15)',
        'text-primary': '#f5f5f7',
        'text-secondary': 'rgba(235, 235, 235, 0.6)',
        'text-tertiary': 'rgba(235, 235, 235, 0.4)',
        'success': '#30d158',
        'warning': '#ffd60a',
        'error': '#ff453a',
        'info': '#64d2ff',
        // Glass effect colors
        'glass': 'rgba(255, 255, 255, 0.05)',
        'glass-border': 'rgba(255, 255, 255, 0.1)',
        // Aliases for convenience
        'card': 'rgba(255, 255, 255, 0.08)',
        'card-hover': 'rgba(255, 255, 255, 0.12)',
      },
      backdropBlur: {
        'xs': '2px',
        'mac': '20px',
      },
      borderRadius: {
        'mac': '10px',
        'mac-lg': '14px',
        'mac-xl': '18px',
      },
      boxShadow: {
        'mac': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'mac-sm': '0 2px 8px rgba(0, 0, 0, 0.3)',
        'glow': '0 0 20px rgba(10, 132, 255, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
