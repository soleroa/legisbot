export interface Suggestion {
  label: string;
  prompt: string;
}

export const SUGGESTIONS: Suggestion[] = [
  {
    label: "Leyes sancionadas este año",
    prompt: "¿Qué leyes se sancionaron en lo que va del año?",
  },
  {
    label: "Presentismo por bloque",
    prompt: "¿Cómo viene el presentismo de los legisladores por bloque?",
  },
  {
    label: "Última sesión",
    prompt: "¿De qué trató la última sesión de la Legislatura?",
  },
  {
    label: "Mensajes del Ejecutivo",
    prompt: "¿Qué mensajes envió el Poder Ejecutivo recientemente y sobre qué temas?",
  },
];
