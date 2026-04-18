import { GoogleGenAI, Type } from "@google/genai";
import { FilmSystemOutput, ProjectInput, RandomIdea, Shot } from "../types";
import { executeWithSystem } from "../lib/requestSystem";

const getApiKey = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key && typeof window !== 'undefined') {
    console.warn("⚠️ GEMINI_API_KEY is not defined. Please check your Environment Variables.");
  }
  return key || "UNDEF_KEY";
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

const callGemini = async (prompt: string, schema: any, cacheKey?: string, fallbackOptions?: any) => {
  try {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        schema,
        cacheKey,
        fallbackOptions,
        config: { model: "gemini-3.1-pro-preview" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "AI Backend Request Failed");
    }

    return await response.json();
  } catch (error: any) {
    console.error("[CineBoard AI Client Error]:", error);
    // If backend fails, check if we have a local fallback in fallbackOptions
    if (fallbackOptions?.enabled && fallbackOptions.templateFallback?.enabled) {
      return generateFallbackOutput({ title: "Error recovery", storyInput: "" } as any);
    }
    throw error;
  }
};

export const generateCasting = async (input: ProjectInput, storyContext?: string): Promise<FilmSystemOutput['casting']> => {
  const prompt = `
    KONTEKS: Kamu adalah AI Casting Director Profesional.
    PROYEK: ${input.title || '(Generate based on story)'}
    Ide Awal: ${input.storyInput}
    Sinopsis: ${storyContext || 'Belum ada sinopsis detail.'}
    Genre: ${input.genre}
    Style: ${input.style}
    Bahasa Output: ${input.language}

    INSTRUKSI:
    1. Buat Casting Detail yang mendalam dan konsisten:
       - Actors: List 2-3 aktor utama dengan deskripsi fisik detail dan visual prompt (English).
       - Elements: 2-3 properti atau elemen visual kunci.
       - Locations: 2-3 lokasi syuting utama dengan deskripsi atmosfer.
       - Time: Setting waktu (pagi/siang/malam/era).
       - Emotions: Deskripsi emosi dominan.
       - Wardrobe: Konsep pakaian karakter.
    2. Seluruh deskripsi teks wajib dalam bahasa: ${input.language}.
    3. Visual Prompt wajib dalam bahasa Inggris.

    PENTING: Kembalikan output dalam format JSON yang valid.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      actors: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            visualPrompt: { type: Type.STRING }
          },
          required: ["name", "description", "visualPrompt"]
        }
      },
      elements: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            visualPrompt: { type: Type.STRING }
          },
          required: ["name", "description", "visualPrompt"]
        }
      },
      locations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            visualPrompt: { type: Type.STRING }
          },
          required: ["name", "description", "visualPrompt"]
        }
      },
      time: { type: Type.STRING },
      emotions: { type: Type.STRING },
      wardrobe: { type: Type.STRING }
    },
    required: ["actors", "elements", "locations", "time", "emotions", "wardrobe"]
  };

  const cacheKey = `casting_${btoa(input.title + input.storyInput + (storyContext || ''))}`;
  const fallbackOptions = {
    enabled: true,
    modes: ['cached_response', 'template_fallback'],
    templateFallback: {
      enabled: true,
      context: {
        context_title: input.title || 'Untitled Project',
        partial_result_or_explanation: 'Gagal generate casting detail. Silakan coba lagi.'
      }
    }
  };
  return callGemini(prompt, schema, cacheKey, fallbackOptions);
};

export const generateStory = async (input: ProjectInput, casting?: FilmSystemOutput['casting']): Promise<Partial<FilmSystemOutput>> => {
  const prompt = `
    KONTEKS: Kamu adalah AI Scriptwriter Profesional.
    PROYEK: ${input.title || '(Generate based on story)'}
    Ide: ${input.storyInput}
    Genre: ${input.genre}
    Style: ${input.style}
    Bahasa Output: ${input.language}
    Format Cerita: ${input.storyFormat}

    ${casting ? `
    CASTING LOCKS (WAJIB DIPATUHI):
    - Actors: ${casting.actors.map(a => `${a.name} (${a.description})`).join(', ')}
    - Locations: ${casting.locations.map(l => `${l.name} (${l.description})`).join(', ')}
    - Elements: ${casting.elements.map(e => e.name).join(', ')}
    ` : 'CASTING: Belum ditentukan. Silakan berkreasi dengan karakter dan lokasi yang kuat.'}

    INSTRUKSI:
    1. Generate Judul, Logline, Sinopsis (150-250 kata), Pesan Utama, dan Master Concept Prompt.
    2. Patuhi Casting Locks. Jangan menambah karakter atau lokasi baru tanpa alasan kuat.
    3. Seluruh output teks wajib dalam bahasa: ${input.language}.
    4. Master Concept Prompt wajib dalam bahasa Inggris.
    5. Format Cerita: ${input.storyFormat}. 
       - Jika 'dialog': Gunakan format script dialog (Nama: Dialog).
       - Jika 'narasi': Gunakan deskripsi naratif cinematic.
       - Jika 'dialog_narasi': Gabungkan narasi dan dialog.

    PENTING: Kembalikan output dalam format JSON yang valid.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      logline: { type: Type.STRING },
      synopsis: { type: Type.STRING },
      mainMessage: { type: Type.STRING },
      masterConceptPrompt: { type: Type.STRING },
      characters: { type: Type.STRING }
    },
    required: ["title", "logline", "synopsis", "mainMessage", "masterConceptPrompt", "characters"]
  };

  const cacheKey = `story_${btoa(input.title + input.storyInput + (casting ? casting.actors.length : 0))}`;
  const fallbackOptions = {
    enabled: true,
    modes: ['cached_response', 'ai_text_recovery', 'template_fallback'],
    aiTextRecovery: {
      enabled: true,
      style: 'informative_concise',
      recoveryFn: async (ctx: any) => {
        // Fallback story structure
        return {
          title: ctx.context_title,
          logline: "Cerita tentang perjuangan dan harapan.",
          synopsis: "Sinopsis tidak dapat digenerate sepenuhnya karena gangguan sistem.",
          mainMessage: "Teruslah berjuang.",
          masterConceptPrompt: "Cinematic film style, high quality",
          characters: "Karakter utama yang kuat."
        };
      }
    },
    templateFallback: {
      enabled: true,
      context: {
        context_title: input.title || 'Untitled Project',
        partial_result_or_explanation: 'Gagal generate cerita lengkap.'
      }
    }
  };
  return callGemini(prompt, schema, cacheKey, fallbackOptions);
};

export const generateShotlist = async (input: ProjectInput, casting: FilmSystemOutput['casting'], story: Partial<FilmSystemOutput>): Promise<Partial<FilmSystemOutput>> => {
  const prompt = `
    KONTEKS: Kamu adalah AI Director of Photography Profesional.
    PROYEK: ${story.title}
    Sinopsis: ${story.synopsis}
    Genre: ${input.genre}
    Style: ${input.style}
    Bahasa Output: ${input.language}
    Aspect Ratio: ${input.aspectRatio}
    Durasi Total: ${input.duration}
    Durasi per Shot: ${input.durationPerShot}
    Format Cerita: ${input.storyFormat}

    CASTING LOCKS (WAJIB DIPATUHI):
    - Actors: ${casting.actors.map(a => a.name).join(', ')}
    - Locations: ${casting.locations.map(l => l.name).join(', ')}

    INSTRUKSI:
    1. Generate max 15 shot yang cinematic.
    2. Bagi menjadi scene yang logis.
    3. Patuhi Casting Locks secara ketat.
    4. Seluruh deskripsi teks wajib dalam bahasa: ${input.language}.
    5. Visual Prompt (untuk Image) wajib dalam bahasa Inggris.
    6. VIDEO VISUAL PROMPT (EMBEDDED CONTENT):
       - Masukkan dialog/narasi LANGSUNG ke dalam videoVisualPrompt.
       - Struktur: [CAMERA + VISUAL + LIGHTING + MOOD + ENVIRONMENT + STORY CONTENT].
       - STORY CONTENT (Dialog/Narasi) wajib dalam bahasa: ${input.language}.
       - Jika format 'dialog': Masukkan dialog (Nama: "Dialog") di akhir deskripsi visual.
       - Jika format 'narasi': Masukkan narasi sebagai deskripsi aksi/suasana yang menyatu.
       - Jika format 'dialog_narasi': Gabungkan narasi lalu dialog secara natural.
       - JANGAN gunakan section terpisah seperti "Dialog:" atau "Narasi:".
    7. DURATION AWARE: Jumlah dialog/narasi dalam prompt harus sesuai durasi:
       - 5s: 1-2 baris dialog/narasi singkat.
       - 10s: 2-4 baris dialog/narasi sedang.
       - 15s: 3-5 baris dialog/narasi detail.

    PENTING: Kembalikan output dalam format JSON yang valid.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            number: { type: Type.INTEGER },
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["number", "title", "description"]
        }
      },
      shots: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            number: { type: Type.INTEGER },
            scene: { type: Type.STRING },
            duration: { type: Type.STRING },
            camera: { type: Type.STRING },
            movement: { type: Type.STRING },
            transition: { type: Type.STRING },
            description: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
            videoVisualPrompt: { type: Type.STRING },
            durationPerShot: { type: Type.STRING },
            content: {
              type: Type.OBJECT,
              properties: {
                dialog: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      character: { type: Type.STRING },
                      line: { type: Type.STRING }
                    },
                    required: ["character", "line"]
                  }
                },
                narration: { type: Type.STRING }
              }
            }
          },
          required: ["number", "scene", "duration", "camera", "movement", "transition", "description", "visualPrompt", "videoVisualPrompt", "durationPerShot"]
        }
      },
      captions: {
        type: Type.OBJECT,
        properties: {
          short: { type: Type.STRING },
          story: { type: Type.STRING },
          viral: { type: Type.STRING }
        },
        required: ["short", "story", "viral"]
      },
      formats: {
        type: Type.OBJECT,
        properties: {
          reels: { type: Type.STRING },
          story: { type: Type.STRING }
        },
        required: ["reels", "story"]
      }
    },
    required: ["scenes", "shots", "captions", "formats"]
  };

  const cacheKey = `shotlist_${btoa(input.title + story.title + input.duration)}`;
  const fallbackOptions = {
    enabled: true,
    modes: ['cached_response', 'template_fallback'],
    templateFallback: {
      enabled: true,
      context: {
        context_title: story.title || 'Untitled Project',
        partial_result_or_explanation: 'Gagal generate shotlist detail.'
      }
    }
  };
  return callGemini(prompt, schema, cacheKey, fallbackOptions);
};

export const generateFilmSystem = async (input: ProjectInput): Promise<FilmSystemOutput> => {
  const prompt = `
    KONTEKS: Kamu adalah AI Sutradara & Scriptwriter Profesional.
    PROYEK: ${input.title || '(Generate based on story)'}
    Ide: ${input.storyInput}
    Genre: ${input.genre}
    Style: ${input.style}
    Visual Effect: ${input.visualEffect}
    Bahasa Output: ${input.language}
    Aspect Ratio: ${input.aspectRatio}
    Durasi: ${input.duration}
    Format Cerita: ${input.storyFormat}
    Shot Mode: ${input.shotMode}
    Custom Shot: ${input.customShot}
    Pesan Utama Manual: ${input.mainMessage}
    Auto Message: ${input.autoMessage}

    INSTRUKSI UTAMA:
    - SELURUH OUTPUT TEKS (Judul, Logline, Sinopsis, Deskripsi, Nama Karakter, dll) WAJIB MENGGUNAKAN BAHASA: ${input.language}.
    - Jika bahasa adalah 'Indonesia', gunakan gaya bahasa perfilman Indonesia yang profesional.
    - Jika bahasa adalah 'English', use professional Hollywood-style cinematic language.
    - Jika bahasa adalah 'Arabic', use professional Arabic cinematic language (Fusha or appropriate dialect for film).

    DETAIL INSTRUKSI:
    1. Jika story_input kosong, buat ide cerita yang menarik berdasarkan genre ${input.genre}.
    2. Generate Judul, Logline, Sinopsis, Pesan Utama (jika auto), dan Master Concept Prompt.
    3. Buat karakter utama yang mendalam.
    4. Buat Casting Detail (Actors, Elements, Locations, Time, Emotions, Wardrobe).
    5. Buat struktur cerita (Setup, Conflict, Resolution) sesuai Format Cerita: ${input.storyFormat}.
    6. Tentukan jumlah shot berdasarkan durasi atau custom shot.
    7. Bagi cerita menjadi scene yang logis.
    8. Generate shotlist detail untuk SETIAP shot.
    9. Visual Prompt harus spesifik untuk image generation (tetap dalam bahasa Inggris untuk hasil terbaik di AI Image Generator).
    10. Video Visual Prompt harus dioptimalkan untuk AI Video Generator (tetap dalam bahasa Inggris).
    11. Generate caption (Short, Story, Viral + hashtag) dalam bahasa ${input.language}.
    12. Generate story format (Reels script, Story slides) dalam bahasa ${input.language}.

    PENTING: Kembalikan output dalam format JSON yang valid sesuai schema.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      logline: { type: Type.STRING },
      synopsis: { type: Type.STRING },
      mainMessage: { type: Type.STRING },
      masterConceptPrompt: { type: Type.STRING },
      characters: { type: Type.STRING },
      casting: {
        type: Type.OBJECT,
        properties: {
          actors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                visualPrompt: { type: Type.STRING }
              },
              required: ["name", "description", "visualPrompt"]
            }
          },
          elements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                visualPrompt: { type: Type.STRING }
              },
              required: ["name", "description", "visualPrompt"]
            }
          },
          locations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                visualPrompt: { type: Type.STRING }
              },
              required: ["name", "description", "visualPrompt"]
            }
          },
          time: { type: Type.STRING },
          emotions: { type: Type.STRING },
          wardrobe: { type: Type.STRING }
        },
        required: ["actors", "elements", "locations", "time", "emotions", "wardrobe"]
      },
      scenes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            number: { type: Type.INTEGER },
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["number", "title", "description"]
        }
      },
      shots: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            number: { type: Type.INTEGER },
            scene: { type: Type.STRING },
            duration: { type: Type.STRING },
            camera: { type: Type.STRING },
            movement: { type: Type.STRING },
            transition: { type: Type.STRING },
            description: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
            videoVisualPrompt: { type: Type.STRING }
          },
          required: ["number", "scene", "duration", "camera", "movement", "transition", "description", "visualPrompt", "videoVisualPrompt"]
        }
      },
      captions: {
        type: Type.OBJECT,
        properties: {
          short: { type: Type.STRING },
          story: { type: Type.STRING },
          viral: { type: Type.STRING }
        },
        required: ["short", "story", "viral"]
      },
      formats: {
        type: Type.OBJECT,
        properties: {
          reels: { type: Type.STRING },
          story: { type: Type.STRING }
        },
        required: ["reels", "story"]
      }
    },
    required: ["title", "logline", "synopsis", "mainMessage", "masterConceptPrompt", "characters", "casting", "scenes", "shots", "captions", "formats"]
  };

  try {
    const cacheKey = `full_${btoa(input.title + input.storyInput + input.genre + input.style)}`;
    const fallbackOptions = {
      enabled: true,
      modes: ['cached_response', 'ai_text_recovery', 'template_fallback'],
      aiTextRecovery: {
        enabled: true,
        style: 'informative_concise',
        recoveryFn: async () => generateFallbackOutput(input)
      },
      templateFallback: {
        enabled: true,
        context: {
          context_title: input.title || 'Untitled Project',
          partial_result_or_explanation: 'Gagal generate sistem film lengkap. Menggunakan fallback statis.'
        }
      }
    };
    return await callGemini(prompt, schema, cacheKey, fallbackOptions);
  } catch (error: any) {
    console.error("Full generation failed, using fallback:", error);
    return generateFallbackOutput(input);
  }
};

export const generateFallbackOutput = (input: ProjectInput): FilmSystemOutput => {
  const title = input.title || "Untitled Cinematic Story";
  
  return {
    title: title,
    logline: "Cerita cinematic tentang perjalanan hidup.",
    synopsis: `Dalam dunia yang didefinisikan oleh genre ${input.genre}, cerita ini mengeksplorasi kedalaman emosi manusia dan kekuatan gaya ${input.style}.`,
    mainMessage: input.mainMessage || "Harapan tetap ada bahkan di masa yang paling gelap.",
    masterConceptPrompt: `Cinematic film still, ${input.style} style, ${input.visualEffect} effect, high quality, 4k, ${input.aspectRatio}`,
    characters: "Protagonis: Individu yang gigih menghadapi rintangan yang mustahil.\nAntagonis: Manifestasi dari tantangan dunia.",
    casting: {
      actors: [{ name: "Aktor Utama", description: "Ekspresif dan intens", visualPrompt: "Close up portrait, cinematic lighting" }],
      elements: [{ name: "Properti Kunci", description: "Objek dengan signifikansi besar", visualPrompt: "Macro shot of a mysterious object" }],
      locations: [{ name: "Setting Utama", description: "Atmosferik dan menggugah", visualPrompt: "Wide landscape shot, ${input.style} aesthetic" }],
      time: "Senja / Golden Hour",
      emotions: "Ketegangan, Keajaiban, Melankolis",
      wardrobe: "Praktis namun bergaya, mencerminkan estetika ${input.style}"
    },
    scenes: [
      { number: 1, title: "Awal", description: "Pembukaan dan pengenalan karakter." },
      { number: 2, title: "Konflik", description: "Masalah muncul dan emosi meningkat." },
      { number: 3, title: "Ending", description: "Resolusi dan fade out." }
    ],
    shots: [
      {
        number: 1,
        scene: "Awal",
        duration: "5s",
        durationPerShot: "5s",
        camera: "Wide Shot",
        movement: "Static",
        transition: "Fade In",
        description: "Opening",
        visualPrompt: "Wide cinematic landscape, ${input.style}, ${input.visualEffect}",
        videoVisualPrompt: "A wide cinematic shot of a breathtaking landscape under ${input.style} lighting. Pemandangan luas yang menakjubkan menyambut mata.",
        content: { narration: "Pemandangan luas yang menakjubkan." }
      },
      {
        number: 2,
        scene: "Awal",
        duration: "5s",
        durationPerShot: "5s",
        camera: "Medium Shot",
        movement: "Static",
        transition: "Cut",
        description: "Character intro",
        visualPrompt: "Protagonist looking determined, ${input.style}",
        videoVisualPrompt: "Medium shot of the protagonist with a determined look. Karakter utama muncul dengan penuh tekad untuk menghadapi tantangan.",
        content: { narration: "Karakter utama muncul dengan penuh tekad." }
      },
      {
        number: 3,
        scene: "Konflik",
        duration: "5s",
        durationPerShot: "5s",
        camera: "Close Up",
        movement: "Handheld",
        transition: "Cut",
        description: "Masalah muncul",
        visualPrompt: "Tense close up, ${input.style}",
        videoVisualPrompt: "Tense close up with handheld camera movement. Ketegangan mulai memuncak saat bayangan gelap mendekat.",
        content: { narration: "Ketegangan mulai memuncak." }
      },
      {
        number: 4,
        scene: "Konflik",
        duration: "5s",
        durationPerShot: "5s",
        camera: "Close Up",
        movement: "Static",
        transition: "Cut",
        description: "Emosi meningkat",
        visualPrompt: "Emotional close up, ${input.style}",
        videoVisualPrompt: "Emotional close up focusing on facial expressions. Aktor Utama: \"Aku tidak akan menyerah sekarang.\"",
        content: { narration: "Ekspresi emosional yang mendalam." }
      },
      {
        number: 5,
        scene: "Ending",
        duration: "5s",
        durationPerShot: "5s",
        camera: "Wide Shot",
        movement: "Dolly Out",
        transition: "Cut",
        description: "Resolusi",
        visualPrompt: "Wide shot of the resolution, ${input.style}",
        videoVisualPrompt: "Wide shot as the camera dollys out. Kedamaian akhirnya kembali ke tanah yang lelah ini.",
        content: { narration: "Kedamaian akhirnya kembali." }
      },
      {
        number: 6,
        scene: "Ending",
        duration: "5s",
        durationPerShot: "5s",
        camera: "Wide Shot",
        movement: "Static",
        transition: "Fade Out",
        description: "Fade out",
        visualPrompt: "Final fading shot, ${input.style}, ${input.visualEffect}",
        videoVisualPrompt: "Final cinematic shot fading slowly to black. Cerita berakhir dengan tenang di bawah cahaya senja.",
        content: { narration: "Cerita berakhir dengan tenang." }
      }
    ],
    captions: {
      short: "Perjalanan cinematic yang tiada duanya. #CineBoard #AI #Film",
      story: `Temukan kekuatan dari ${title}. Tonton sekarang.`,
      viral: `Ini akan mengubah cara Anda melihat ${input.genre}. #Viral #Cinematic`
    },
    formats: {
      reels: "Scene 1: Awal\nScene 2: Konflik\nScene 3: Ending",
      story: "Slide 1: Judul.\nSlide 2: Konflik.\nSlide 3: Resolusi."
    }
  };
};

export const generateRandomIdea = async (genre: string, language: string = "Indonesia"): Promise<RandomIdea> => {
  const prompt = `Generate a unique and creative film story idea for the genre: ${genre}. 
  IMPORTANT: The output must be in ${language} language.
  Return a JSON object with:
  - title: A catchy title (in ${language})
  - story: A one-sentence hook or brief story idea (in ${language})
  - message: A deep moral or emotional message (in ${language})
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      story: { type: Type.STRING },
      message: { type: Type.STRING }
    },
    required: ["title", "story", "message"]
  };

  return callGemini(prompt, schema, `random_idea_${genre}_${language}`);
};

export const generateImage = async (prompt: string, aspectRatio: string = "16:9"): Promise<string> => {
  try {
    const response = await fetch("/api/ai/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        aspectRatio,
        cacheKey: `img_${btoa(prompt + aspectRatio)}`
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Image Generation Failed");
    }

    const data = await response.json();
    return data.imageUrl;
  } catch (error) {
    console.error("[Image Client Error]:", error);
    throw error;
  }
};
