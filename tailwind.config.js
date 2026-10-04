module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        ink: '#111111',
        ink2: '#1A1A1A',
        burgundy: '#9E0038',
        burgundyDark: '#78002B',
        gold: '#D4AF37',
        goldLight: '#E5A024',
        cream: '#F8F9FA',
        panel: '#171717',
        deep: '#0B0B0B',
        soft: '#1E1E1E'
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        premium: '0 24px 60px -20px rgba(17,17,17,0.35)',
        card: '0 18px 45px -22px rgba(17,17,17,0.28)',
        gold: '0 14px 34px -14px rgba(212,175,55,0.65)'
      }
    }
  },
  plugins: []
}
