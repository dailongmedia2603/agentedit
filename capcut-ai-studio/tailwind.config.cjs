/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF4ED',
          100: '#FFE6D5',
          200: '#FFC8A8',
          300: '#FFA270',
          400: '#FF7A37',
          500: '#FF7A1A',
          600: '#F2620A',
          700: '#C84A0A',
          800: '#9E3C10',
          900: '#7F3411',
          950: '#451907'
        },
        ink: {
          50: '#F6F7F9',
          100: '#ECEEF2',
          800: '#1A1C22',
          900: '#121318',
          950: '#0B0C10'
        }
      },
      fontFamily: {
        sans: ['SVN-Gilroy', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,122,26,0.25), 0 8px 30px -8px rgba(255,122,26,0.35)'
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(255,122,26,0.5)' },
          '70%': { boxShadow: '0 0 0 10px rgba(255,122,26,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(255,122,26,0)' }
        }
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s infinite'
      }
    }
  },
  plugins: []
}
