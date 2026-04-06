/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // CoESCD government blue palette
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#1d4ed8',
          600: '#1e40af',
          700: '#1e3a8a',
          800: '#1e3366',
          900: '#172554',
        },
        // Severity colors (1=green → 5=dark red)
        severity: {
          1: '#22c55e',
          2: '#84cc16',
          3: '#f59e0b',
          4: '#ef4444',
          5: '#7f1d1d',
        },
        // Hazard class colors
        hazard: {
          flood:     '#3b82f6',
          landslide: '#a16207',
          seismic:   '#dc2626',
          wildfire:  '#f97316',
        },
      },
    },
  },
  plugins: [],
};
