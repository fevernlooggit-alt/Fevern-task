/** @type {import('tailwindcss').Config} */
// Aurora Phantom design tokens from the prototype (PRD §3).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0F1E',
        panel: '#111A2E',
        panel2: '#0E1526',
        line: '#1E2A44',
        teal: '#46E3B7',
        violet: '#9D8CFF',
        ice: '#6EC1FF',
        text: '#E8EEF9',
        muted: '#7C8AA5',
        danger: '#FF7A8A',
        amber: '#FFC46B',
      },
      borderRadius: {
        card: '14px',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
