import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        portoBlue: "#0056A3",
        portoDark: "#003F7D",
        portoGold: "#F0B323"
      }
    }
  },
  plugins: []
};

export default config;
