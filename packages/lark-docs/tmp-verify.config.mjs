import tailwindcss from "@tailwindcss/vite";
export default { root: "tmp-verify", base: "./", plugins: [tailwindcss()], build: { outDir: "out" } };
