import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        paper: "#f7f4ee",
        mint: "#2f8f83",
        coral: "#d66b4d",
        gold: "#c99a2e"
      },
      boxShadow: {
        soft: "0 14px 40px rgba(23, 32, 42, 0.09)"
      }
    }
  },
  plugins: []
};

export default config;
