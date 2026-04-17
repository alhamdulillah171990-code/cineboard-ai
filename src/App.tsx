/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Film, 
  Sparkles, 
  Layout, 
  Type, 
  Globe, 
  Maximize, 
  Clock, 
  Zap, 
  RefreshCw, 
  Image as ImageIcon, 
  FileText, 
  Users, 
  Clapperboard, 
  Camera, 
  Share2, 
  Download,
  ChevronRight,
  Loader2,
  Dices,
  MapPin,
  Box,
  Sun,
  Wand2,
  Trash2,
  ExternalLink,
  Lock,
  Unlock,
  Eye,
  Copy,
  Check,
  X,
  Settings2,
  FolderOpen,
  Plus,
  LogOut,
  LogIn,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { 
  ProjectInput, 
  FilmSystemOutput, 
  Genre, 
  VisualStyle, 
  Language, 
  AspectRatio, 
  Duration, 
  ShotMode,
  StoryFormat,
  CastingItem,
  Shot,
  RandomIdea,
  Project
} from './types';
import { generateFilmSystem, generateRandomIdea, generateImage, generateFallbackOutput, generateCasting, generateStory, generateShotlist } from './services/geminiService';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  db, 
  handleFirestoreError, 
  OperationType,
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from './firebase';
import type { User } from './firebase';

const INITIAL_GENRES = [
  'Drama', 'Action', 'Horror', 'Sci-Fi', 'Comedy', 'Islami', 'Documentary', 'Fantasy', 
  'Romance', 'Thriller', 'Mystery', 'Musical', 'Western', 'War', 'Animation', 
  'Biography', 'Crime', 'Family', 'History', 'Sport'
];

const INITIAL_STYLES = [
  'Cinematic', 'Anime', 'Realistic', 'Dark', 'Futuristic', 'Vintage', 'Noir', 
  'Minimalist', 'Cyberpunk', 'Surreal', 'Brutalist', 'Pastel', 'High Contrast', 
  'Hand-drawn', '3D Render', 'Glitch', 'Pop Art', 'Gothic', 'Steampunk', 'Vaporwave'
];

const INITIAL_EFFECTS = [
  // Natural Atmosphere
  'Rain', 'Heavy Storm Rain', 'Drizzle', 'Fog / Mist', 'Smoke', 'Wind Motion', 'Snow Falling', 'Sand Storm', 'Dust Particles', 'Cloud Overcast Lighting',
  // Fire & Energy
  'Fire Glow', 'Explosion Burst', 'Spark Particles', 'Lightning Strike', 'Electric Energy', 'Burning Embers', 'Energy Aura', 'Flame Trails',
  // Light & Cinematic
  'Lens Flare', 'God Rays', 'Neon Glow', 'Soft Bloom Light', 'Light Leak', 'Volumetric Lighting', 'Glitter Sparkle',
  // Sci-Fi & Digital
  'Glitch Effect', 'Hologram Projection', 'Digital Scan Lines', 'Portal Warp Effect', 'Cyber Grid Overlay',
  // Emotional & Cinematic Mood
  'Slow Motion Time Effect', 'Vignette Dark Edge', 'Film Grain Texture'
];

const downloadImage = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
};

let cache: Record<string, FilmSystemOutput> = {};
let lastRequestTime = 0;
let requestCount = 0;

const INITIAL_INPUT: ProjectInput = {
  title: '',
  storyInput: '',
  genre: 'Drama',
  style: 'Cinematic',
  visualEffect: 'None',
  language: 'Indonesia',
  aspectRatio: '16:9',
  duration: '1m',
  durationPerShot: '5s',
  storyFormat: 'dialog_narasi',
  shotMode: 'Auto',
  customShot: 20,
  mainMessage: '',
  autoMessage: true,
};

export default function App() {
  const [input, setInput] = useState<ProjectInput>(INITIAL_INPUT);
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0);

  const [output, setOutput] = useState<FilmSystemOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingIdea, setGeneratingIdea] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({});

  // Firebase State
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showProjectList, setShowProjectList] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const getCacheKey = (input: ProjectInput) => {
    return `cineboard_cache_${btoa(input.title + input.storyInput + input.genre + input.style + input.visualEffect + input.language + input.aspectRatio + input.duration + input.durationPerShot + input.shotMode + input.customShot + input.mainMessage + input.autoMessage + input.storyFormat)}`;
  };

  const [genres, setGenres] = useState<string[]>(() => {
    const saved = localStorage.getItem('cineboard_genres');
    return saved ? JSON.parse(saved) : INITIAL_GENRES;
  });
  const [styles, setStyles] = useState<string[]>(() => {
    const saved = localStorage.getItem('cineboard_styles');
    return saved ? JSON.parse(saved) : INITIAL_STYLES;
  });

  const [effects, setEffects] = useState<string[]>(() => {
    const saved = localStorage.getItem('cineboard_effects');
    return saved ? JSON.parse(saved) : INITIAL_EFFECTS;
  });

  const [editingGenre, setEditingGenre] = useState<string | null>(null);
  const [editingStyle, setEditingStyle] = useState<string | null>(null);
  const [editingEffect, setEditingEffect] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<{ title: string, description: string, imageUrl?: string, prompt?: string } | null>(null);

  useEffect(() => {
    localStorage.setItem('cineboard_genres', JSON.stringify(genres));
  }, [genres]);

  useEffect(() => {
    localStorage.setItem('cineboard_styles', JSON.stringify(styles));
  }, [styles]);

  useEffect(() => {
    localStorage.setItem('cineboard_effects', JSON.stringify(effects));
  }, [effects]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firebase Projects Listener
  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('lastUpdated', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projs = snapshot.docs.map(doc => doc.data() as Project);
      setProjects(projs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'projects');
    });
    return () => unsubscribe();
  }, [user]);

  // Auto-save logic
  useEffect(() => {
    if (!user || !currentProjectId) return;
    const timer = setTimeout(() => {
      saveProject();
    }, 10000); // 10s auto-save
    return () => clearTimeout(timer);
  }, [input, output, user, currentProjectId]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setCurrentProjectId(null);
      setInput(INITIAL_INPUT);
      setOutput(null);
      setCurrentStep(0);
    } catch (err) {
      console.error(err);
    }
  };

  const saveProject = async (manual = false) => {
    if (!user) {
      if (manual) login();
      return;
    }
    setIsSaving(true);
    const projectId = currentProjectId || crypto.randomUUID();
    const projectData: Project = {
      id: projectId,
      name: input.title || 'Untitled Project',
      userId: user.uid,
      input,
      output,
      lastUpdated: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'projects', projectId), projectData);
      setCurrentProjectId(projectId);
      if (manual) {
        setError("Project saved successfully!");
        setTimeout(() => setError(null), 2000);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `projects/${projectId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const loadProject = (project: Project) => {
    setInput(project.input);
    setOutput(project.output);
    setCurrentProjectId(project.id);
    setCurrentStep(0);
    setShowProjectList(false);
  };

  const deleteProject = async (projectId: string) => {
    if (!user) return;
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
        setInput(INITIAL_INPUT);
        setOutput(null);
        setCurrentStep(0);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}`);
    }
  };

  const duplicateProject = async (project: Project) => {
    if (!user) return;
    setIsSaving(true);
    const newId = crypto.randomUUID();
    const duplicatedProject: Project = {
      ...project,
      id: newId,
      name: `${project.name} (Copy)`,
      lastUpdated: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'projects', newId), duplicatedProject);
      setError("Project duplicated!");
      setTimeout(() => setError(null), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `projects/${newId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const createNewProject = () => {
    setCurrentProjectId(null);
    setInput(INITIAL_INPUT);
    setOutput(null);
    setCurrentStep(0);
    setShowProjectList(false);
  };

  const handleInputChange = (field: keyof ProjectInput, value: any) => {
    setInput(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateIdea = async () => {
    setGeneratingIdea(true);
    try {
      const idea = await generateRandomIdea(input.genre, input.language);
      setInput(prev => ({
        ...prev,
        title: idea.title,
        storyInput: idea.story,
        mainMessage: idea.message
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingIdea(false);
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 0) return true;
    if (step === 1) {
      return !!(output?.synopsis);
    }
    if (step === 2) {
      return !!(output?.casting && output.casting.actors.length > 0);
    }
    return false;
  };

  const handleStepClick = (step: number) => {
    if (validateStep(step)) {
      setCurrentStep(step as any);
    } else {
      let msg = "";
      if (step === 1) msg = "Selesaikan Concept Layer (Step 1) terlebih dahulu.";
      if (step === 2) msg = "Selesaikan Casting & Scene Layer (Step 2) terlebih dahulu.";
      setError(msg);
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleGenerateStory = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const story = await generateStory(input, output?.casting);
      setOutput(prev => ({
        ...(prev || generateFallbackOutput(input)),
        ...story as any
      }));
      setCurrentStep(1);
    } catch (err) {
      console.error(err);
      setError('Gagal generate concept. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCasting = async () => {
    if (loading || !output?.synopsis) return;
    setLoading(true);
    setError(null);
    try {
      const casting = await generateCasting(input, output.synopsis);
      setOutput(prev => ({
        ...prev!,
        casting
      }));
      setCurrentStep(2);
    } catch (err) {
      console.error(err);
      setError('Gagal generate casting. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateShotlist = async () => {
    if (loading || !output?.casting || !output?.synopsis) return;
    setLoading(true);
    setError(null);
    try {
      const shotlist = await generateShotlist(input, output.casting, output);
      
      setOutput(prev => ({
        ...prev!,
        ...shotlist as any
      }));
      setCurrentStep(2);
    } catch (err) {
      console.error(err);
      setError('Gagal generate shotlist. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFilm = async () => {
    const now = Date.now();

    // LIMIT USAGE
    if (now - lastRequestTime < 60000) {
      requestCount++;
      if (requestCount > 5) {
        setError("⚠️ Terlalu banyak permintaan (Limit 5/menit). Silakan tunggu sebentar.");
        return;
      }
    } else {
      requestCount = 1;
    }
    lastRequestTime = now;

    if (loading) return; // Anti-spam
    setLoading(true);
    setError(null);

    const cacheKey = getCacheKey(input);
    
    // CACHE
    if (cache[cacheKey]) {
      setOutput(cache[cacheKey]);
      setLoading(false);
      return;
    }

    const cachedLocal = localStorage.getItem(cacheKey);
    if (cachedLocal) {
      const parsed = JSON.parse(cachedLocal);
      cache[cacheKey] = parsed;
      setOutput(parsed);
      setLoading(false);
      return;
    }

    try {
      let result: FilmSystemOutput;
      
      try {
        result = await generateFilmSystem(input);
        cache[cacheKey] = result;
      } catch (error: any) {
        const errorMsg = error.message || String(error);

        // JIKA QUOTA HABIS → LANGSUNG FALLBACK
        if (errorMsg.includes("429")) {
          console.error("Quota exceeded (429), switching to fallback.");
          result = generateFallbackOutput(input);
        } else {
          // RETRY 1x
          try {
            console.log("Retrying API call in 2s...");
            await new Promise(res => setTimeout(res, 2000));
            result = await generateFilmSystem(input);
            cache[cacheKey] = result;
          } catch {
            console.error("Retry failed, switching to fallback.");
            result = generateFallbackOutput(input);
          }
        }
      }
      
      // Handle Locks
      if (output) {
        result.casting.actors = result.casting.actors.map((actor, i) => {
          const existing = output.casting.actors[i];
          return existing?.locked ? existing : actor;
        });
        result.casting.elements = result.casting.elements.map((el, i) => {
          const existing = output.casting.elements[i];
          return existing?.locked ? existing : el;
        });
        result.casting.locations = result.casting.locations.map((loc, i) => {
          const existing = output.casting.locations[i];
          return existing?.locked ? existing : loc;
        });
        result.shots = result.shots.map((shot, i) => {
          const existing = output.shots[i];
          return existing?.locked ? existing : shot;
        });
      }

      setOutput(result);
      localStorage.setItem(cacheKey, JSON.stringify(result));

      // Auto generate master concept image
      try {
        const masterImageUrl = await generateImage(result.masterConceptPrompt, input.aspectRatio);
        if (masterImageUrl) {
          setOutput(prev => {
            if (!prev) return prev;
            const next = { ...prev, masterConceptImageUrl: masterImageUrl };
            localStorage.setItem(cacheKey, JSON.stringify(next));
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to generate master concept image:", err);
      }
    } catch (err) {
      console.error(err);
      setError('⚠️ Server sedang sibuk atau batas penggunaan tercapai. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async (id: string, prompt: string, type: 'actor' | 'element' | 'location' | 'shot' | 'master', index?: number) => {
    setGeneratingImages(prev => ({ ...prev, [id]: true }));
    try {
      const imageUrl = await generateImage(prompt, input.aspectRatio);
      if (imageUrl) {
        updateOutputItem(type, index, { imageUrl });
      }
    } catch (err) {
      console.error(err);
      // If image fails, we might want to flag offline mode for images too
    } finally {
      setGeneratingImages(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleUploadImage = (type: 'actor' | 'element' | 'location' | 'shot', index: number, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      updateOutputItem(type, index, { imageUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAllShotImages = async () => {
    if (!output) return;
    for (let i = 0; i < output.shots.length; i++) {
      const shot = output.shots[i];
      if (!shot.imageUrl && !shot.locked) {
        await handleGenerateImage(`shot-${i}`, shot.visualPrompt, 'shot', i);
      }
    }
  };

  const handleGenerateAllCasting = async () => {
    if (!output) return;
    // Actors
    for (let i = 0; i < output.casting.actors.length; i++) {
      const actor = output.casting.actors[i];
      if (!actor.imageUrl && !actor.locked) {
        await handleGenerateImage(`actor-${i}`, actor.visualPrompt, 'actor', i);
      }
    }
    // Locations
    for (let i = 0; i < output.casting.locations.length; i++) {
      const loc = output.casting.locations[i];
      if (!loc.imageUrl && !loc.locked) {
        await handleGenerateImage(`loc-${i}`, loc.visualPrompt, 'location', i);
      }
    }
    // Elements
    for (let i = 0; i < output.casting.elements.length; i++) {
      const el = output.casting.elements[i];
      if (!el.imageUrl && !el.locked) {
        await handleGenerateImage(`el-${i}`, el.visualPrompt, 'element', i);
      }
    }
  };

  const updateOutputItem = (type: 'actor' | 'element' | 'location' | 'shot' | 'master', index: number | undefined, data: any) => {
    setOutput(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      if (type === 'master') return { ...next, ...data };
      if (index === undefined) return prev;
      if (type === 'actor') next.casting.actors[index] = { ...next.casting.actors[index], ...data };
      if (type === 'element') next.casting.elements[index] = { ...next.casting.elements[index], ...data };
      if (type === 'location') next.casting.locations[index] = { ...next.casting.locations[index], ...data };
      if (type === 'shot') next.shots[index] = { ...next.shots[index], ...data };
      return next;
    });
  };

  const handleToggleLock = (type: 'actor' | 'element' | 'location' | 'shot', index: number) => {
    setOutput(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      if (type === 'actor') next.casting.actors[index].locked = !next.casting.actors[index].locked;
      if (type === 'element') next.casting.elements[index].locked = !next.casting.elements[index].locked;
      if (type === 'location') next.casting.locations[index].locked = !next.casting.locations[index].locked;
      if (type === 'shot') next.shots[index].locked = !next.shots[index].locked;
      return next;
    });
  };

  const handleUpdateCastingItem = (type: 'actor' | 'element' | 'location', index: number, field: string, value: string) => {
    setOutput(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      if (type === 'actor') (next.casting.actors[index] as any)[field] = value;
      if (type === 'element') (next.casting.elements[index] as any)[field] = value;
      if (type === 'location') (next.casting.locations[index] as any)[field] = value;
      return next;
    });
  };

  const exportToTxt = () => {
    if (!output) return;
    const content = `
TITLE: ${output.title}
LOGLINE: ${output.logline}
SYNOPSIS: ${output.synopsis}
MAIN MESSAGE: ${output.mainMessage}
CHARACTERS: ${output.characters}

CASTING:
Time: ${output.casting.time}
Actors: ${output.casting.actors.map(a => `${a.name}: ${a.description}`).join(', ')}
Locations: ${output.casting.locations.map(l => `${l.name}: ${l.description}`).join(', ')}
Elements: ${output.casting.elements.map(e => `${e.name}: ${e.description}`).join(', ')}

SCENES:
${output.scenes.map(s => `Scene ${s.number}: ${s.title}\n${s.description}`).join('\n\n')}

SHOTLIST:
${output.shots.map(s => `Shot ${s.number} [${s.camera}]: ${s.description}`).join('\n')}
    `;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${output.title.replace(/\s+/g, '_')}_CineBoard.txt`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-dark-bg text-gray-200 p-4 md:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gold rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.4)]">
            <Film className="text-black w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-serif font-bold text-white tracking-tight">
              CineBoard <span className="text-gold">AI Studio</span>
            </h1>
            <p className="text-xs text-gray-500 uppercase tracking-[0.2em] font-bold">
              Ultra Pro X+ v2.0 • Cinematic Engine
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 mr-2">
              <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-gold/50" />
              <div className="hidden sm:block">
                <p className="text-[10px] text-gold font-bold uppercase leading-none">{user.displayName}</p>
                <button onClick={logout} className="text-[8px] text-gray-500 hover:text-white uppercase font-bold tracking-widest">Logout</button>
              </div>
            </div>
          ) : (
            <button onClick={login} className="cinematic-button-secondary flex items-center gap-2 mr-2">
              <LogIn size={18} /> Login
            </button>
          )}

          <button 
            onClick={() => setShowProjectList(true)}
            className="cinematic-button-secondary flex items-center gap-2"
            title="Open Projects"
          >
            <FolderOpen size={18} /> <span className="hidden sm:inline">Projects</span>
          </button>
          
          <button 
            onClick={() => saveProject(true)}
            disabled={isSaving}
            className="cinematic-button-secondary flex items-center gap-2"
            title="Save Project"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} <span className="hidden sm:inline">Save</span>
          </button>

          <button 
            onClick={exportToTxt}
            disabled={!output}
            className="cinematic-button-secondary flex items-center gap-2 disabled:opacity-30"
          >
            <Download size={18} /> <span className="hidden sm:inline">Export TXT</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Inputs */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Project Input Box */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="cinematic-card"
          >
            <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
              <Clapperboard className="text-gold" size={20} />
              <h2 className="text-lg font-serif font-bold text-white">🎬 PROJECT INPUT</h2>
            </div>

            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <div className="flex-1 mr-4">
                  <label className="label-gold">Bahasa</label>
                  <select 
                    className="cinematic-input w-full"
                    value={input.language}
                    onChange={(e) => handleInputChange('language', e.target.value)}
                  >
                    {['Indonesia', 'English', 'Arabic'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={handleGenerateIdea}
                  disabled={generatingIdea}
                  className="text-[10px] text-gold hover:text-gold-light flex items-center gap-1 uppercase font-bold tracking-wider bg-gold/10 px-3 py-1.5 rounded-full border border-gold/20 h-fit"
                >
                  {generatingIdea ? <Loader2 size={12} className="animate-spin" /> : <Dices size={12} />}
                  Generate Random Idea
                </button>
              </div>

              <div>
                <label className="label-gold">Judul Film</label>
                <input 
                  type="text" 
                  className="cinematic-input w-full"
                  placeholder="Judul (opsional)..."
                  value={input.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                />
              </div>

              <div>
                <label className="label-gold">Ide Cerita</label>
                <textarea 
                  className="cinematic-input w-full h-32 resize-none"
                  placeholder="Tulis ide atau script di sini..."
                  value={input.storyInput}
                  onChange={(e) => handleInputChange('storyInput', e.target.value)}
                />
              </div>

              <div>
                <label className="label-gold">🎯 Pesan Utama (Override)</label>
                <input 
                  type="text" 
                  className="cinematic-input w-full"
                  placeholder="Pesan moral/emosional..."
                  value={input.mainMessage}
                  onChange={(e) => handleInputChange('mainMessage', e.target.value)}
                  disabled={input.autoMessage}
                />
                <div className="mt-2 flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="auto_msg"
                    checked={input.autoMessage}
                    onChange={(e) => handleInputChange('autoMessage', e.target.checked)}
                    className="accent-gold"
                  />
                  <label htmlFor="auto_msg" className="text-xs text-gray-500 cursor-pointer">Auto Generate Pesan Utama</label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <div className="flex justify-between items-center mb-1">
                    <label className="label-gold mb-0">Genre</label>
                    <button 
                      onClick={() => setEditingGenre(editingGenre === 'manage' ? null : 'manage')}
                      className="text-[10px] text-gray-500 hover:text-gold"
                    >
                      Manage
                    </button>
                  </div>
                  <select 
                    className="cinematic-input w-full"
                    value={input.genre}
                    onChange={(e) => handleInputChange('genre', e.target.value)}
                  >
                    {genres.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <AnimatePresence>
                    {editingGenre === 'manage' && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute z-50 top-full left-0 w-full mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3 shadow-2xl max-h-60 overflow-y-auto"
                      >
                        <div className="space-y-2">
                          {genres.map((g, i) => (
                            <div key={i} className="flex items-center gap-2 group">
                              <input 
                                type="text" 
                                className="bg-black/50 border border-gray-800 text-[10px] px-2 py-1 flex-1 rounded"
                                value={g}
                                onChange={(e) => {
                                  const next = [...genres];
                                  next[i] = e.target.value;
                                  setGenres(next);
                                }}
                              />
                              <button 
                                onClick={() => setGenres(genres.filter((_, idx) => idx !== i))}
                                className="text-red-500 opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                          <button 
                            onClick={() => setGenres([...genres, 'New Genre'])}
                            className="w-full py-1 border border-dashed border-gray-700 text-[10px] text-gray-500 hover:border-gold hover:text-gold rounded"
                          >
                            + Add Genre
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="relative">
                  <div className="flex justify-between items-center mb-1">
                    <label className="label-gold mb-0">Style Visual</label>
                    <button 
                      onClick={() => setEditingStyle(editingStyle === 'manage' ? null : 'manage')}
                      className="text-[10px] text-gray-500 hover:text-gold"
                    >
                      Manage
                    </button>
                  </div>
                  <select 
                    className="cinematic-input w-full"
                    value={input.style}
                    onChange={(e) => handleInputChange('style', e.target.value)}
                  >
                    {styles.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <AnimatePresence>
                    {editingStyle === 'manage' && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute z-50 top-full left-0 w-full mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3 shadow-2xl max-h-60 overflow-y-auto"
                      >
                        <div className="space-y-2">
                          {styles.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 group">
                              <input 
                                type="text" 
                                className="bg-black/50 border border-gray-800 text-[10px] px-2 py-1 flex-1 rounded"
                                value={s}
                                onChange={(e) => {
                                  const next = [...styles];
                                  next[i] = e.target.value;
                                  setStyles(next);
                                }}
                              />
                              <button 
                                onClick={() => setStyles(styles.filter((_, idx) => idx !== i))}
                                className="text-red-500 opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                          <button 
                            onClick={() => setStyles([...styles, 'New Style'])}
                            className="w-full py-1 border border-dashed border-gray-700 text-[10px] text-gray-500 hover:border-gold hover:text-gold rounded"
                          >
                            + Add Style
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="relative">
                <div className="flex justify-between items-center mb-1">
                  <label className="label-gold mb-0">Effect Visual</label>
                  <button 
                    onClick={() => setEditingEffect(editingEffect === 'manage' ? null : 'manage')}
                    className="text-[10px] text-gray-500 hover:text-gold"
                  >
                    Manage
                  </button>
                </div>
                <select 
                  className="cinematic-input w-full"
                  value={input.visualEffect}
                  onChange={(e) => handleInputChange('visualEffect', e.target.value)}
                >
                  <option value="None">None (Tanpa Efek)</option>
                  {effects.map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
                <AnimatePresence>
                  {editingEffect === 'manage' && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute z-50 top-full left-0 w-full mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3 shadow-2xl max-h-60 overflow-y-auto"
                    >
                      <div className="space-y-2">
                        {effects.map((e, i) => (
                          <div key={i} className="flex items-center gap-2 group">
                            <input 
                              type="text" 
                              className="bg-black/50 border border-gray-800 text-[10px] px-2 py-1 flex-1 rounded"
                              value={e}
                              onChange={(val) => {
                                const next = [...effects];
                                next[i] = val.target.value;
                                setEffects(next);
                              }}
                            />
                            <button 
                              onClick={() => setEffects(effects.filter((_, idx) => idx !== i))}
                              className="text-red-500 opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button 
                          onClick={() => setEffects([...effects, 'New Effect'])}
                          className="w-full py-1 border border-dashed border-gray-700 text-[10px] text-gray-500 hover:border-gold hover:text-gold rounded"
                        >
                          + Add Effect
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-gold">Aspect Ratio</label>
                  <select 
                    className="cinematic-input w-full"
                    value={input.aspectRatio}
                    onChange={(e) => handleInputChange('aspectRatio', e.target.value)}
                  >
                    {['16:9', '9:16', '1:1', '2.35:1'].map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-gold">Durasi Total</label>
                  <select 
                    className="cinematic-input w-full"
                    value={input.duration}
                    onChange={(e) => handleInputChange('duration', e.target.value)}
                  >
                    {['15s', '30s', '1m', '2m', '3m', '4m', '5m', 'Custom'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-gold">Durasi per Shot</label>
                  <select 
                    className="cinematic-input w-full"
                    value={input.durationPerShot}
                    onChange={(e) => handleInputChange('durationPerShot', e.target.value)}
                  >
                    {['5s', '10s', '15s'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label-gold">Format Cerita</label>
                <select 
                  className="cinematic-input w-full"
                  value={input.storyFormat}
                  onChange={(e) => handleInputChange('storyFormat', e.target.value)}
                >
                  <option value="dialog">Dialog (Script Format)</option>
                  <option value="narasi">Narasi (Cinematic Description)</option>
                  <option value="dialog_narasi">Dialog + Narasi (Hybrid)</option>
                </select>
              </div>
            </div>
          </motion.section>

          {/* AI Tools Box */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="cinematic-card"
          >
            <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
              <Sparkles className="text-gold" size={20} />
              <h2 className="text-lg font-serif font-bold text-white">🧠 AI STORY ENGINE</h2>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-between mb-8 px-2">
              {[
                { id: 0, label: 'Concept', icon: Sparkles },
                { id: 1, label: 'Casting & Scene', icon: Users },
                { id: 2, label: 'Shotlist', icon: Camera }
              ].map((s, i) => (
                <React.Fragment key={s.id}>
                  <button 
                    onClick={() => handleStepClick(s.id)}
                    className="flex flex-col items-center gap-2 relative group outline-none"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                      currentStep === s.id ? "border-gold bg-gold text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]" : 
                      currentStep > s.id ? "border-gold bg-gold/20 text-gold" : 
                      "border-gray-800 bg-gray-900 text-gray-600 group-hover:border-gray-600"
                    )}>
                      <s.icon size={18} />
                    </div>
                    <span className={cn(
                      "text-[10px] uppercase font-bold tracking-widest transition-colors",
                      currentStep === s.id ? "text-gold" : "text-gray-600 group-hover:text-gray-400"
                    )}>{s.label}</span>
                    {currentStep === s.id && (
                      <motion.div 
                        layoutId="activeStep"
                        className="absolute -bottom-2 w-1 h-1 bg-gold rounded-full"
                      />
                    )}
                  </button>
                  {i < 2 && (
                    <div className="flex-1 h-[2px] bg-gray-800 mx-2 -mt-6">
                      <motion.div 
                        initial={{ width: '0%' }}
                        animate={{ width: currentStep > i ? '100%' : '0%' }}
                        className="h-full bg-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]"
                      />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="space-y-6">
              {currentStep === 0 && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 italic">Langkah 1: CONCEPT LAYER. Generate Ide Kreatif, Judul, Logline, dan Sinopsis berdasarkan input Anda.</p>
                  <button 
                    onClick={handleGenerateStory}
                    disabled={loading}
                    className="cinematic-button-primary w-full flex items-center justify-center gap-3"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                    {loading ? 'Developing Concept...' : '🚀 Step 1: Generate Concept Layer'}
                  </button>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 italic">Langkah 2: CASTING & SCENE LAYER. Tentukan Aktor, Lokasi, dan Breakdown Scene berdasarkan Concept Layer.</p>
                  <button 
                    onClick={handleGenerateCasting}
                    disabled={loading}
                    className="cinematic-button-primary w-full flex items-center justify-center gap-3"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Users size={20} />}
                    {loading ? 'Casting Characters...' : '🚀 Step 2: Generate Casting & Scene Layer'}
                  </button>
                  <button 
                    onClick={() => setCurrentStep(0)}
                    className="w-full py-2 text-xs text-gray-500 hover:text-gold transition-colors"
                  >
                    ← Kembali ke Concept
                  </button>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-black/30 rounded-lg border border-gray-800">
                    <span className="text-sm font-medium">Mode Shot</span>
                    <div className="flex gap-2">
                      {['Auto', 'Custom'].map(m => (
                        <button
                          key={m}
                          onClick={() => handleInputChange('shotMode', m)}
                          className={cn(
                            "px-3 py-1 rounded text-xs font-bold transition-all",
                            input.shotMode === m ? "bg-gold text-black" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {input.shotMode === 'Custom' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-2"
                    >
                      <div className="flex justify-between text-xs font-mono text-gold">
                        <span>5 Shots</span>
                        <span>{input.customShot} Shots</span>
                        <span>200 Shots</span>
                      </div>
                      <input 
                        type="range" 
                        min="5" 
                        max="200" 
                        step="5"
                        value={input.customShot}
                        onChange={(e) => handleInputChange('customShot', parseInt(e.target.value))}
                        className="w-full accent-gold bg-gray-800 h-1 rounded-lg appearance-none cursor-pointer"
                      />
                    </motion.div>
                  )}

                  <p className="text-xs text-gray-500 italic">Langkah 3: SHOTLIST LAYER. Eksekusi Kamera dan Visual Prompt untuk setiap shot.</p>
                  <button 
                    onClick={handleGenerateShotlist}
                    disabled={loading}
                    className="cinematic-button-primary w-full flex items-center justify-center gap-3"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                    {loading ? 'Executing Shotlist...' : '🚀 Step 3: Generate Shotlist Layer'}
                  </button>
                  <button 
                    onClick={() => setCurrentStep(1)}
                    className="w-full py-2 text-xs text-gray-500 hover:text-gold transition-colors"
                  >
                    ← Kembali ke Casting & Scene
                  </button>
                </div>
              )}


              <button 
                onClick={() => {
                  setInput(INITIAL_INPUT);
                  setOutput(null);
                  setError(null);
                  setCurrentStep(0);
                }}
                className="w-full py-2 border border-dashed border-gray-700 text-xs text-gray-500 hover:border-gold hover:text-gold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} />
                Reset Pipeline
              </button>
            </div>
          </motion.section>
        </div>

        {/* Right Column: Outputs */}
        <div className="lg:col-span-8 space-y-8">
          
          <AnimatePresence mode="wait">
            {!output && !loading && !error && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[600px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-gray-800 rounded-3xl"
              >
                <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-6 border border-gray-800">
                  <Clapperboard size={40} className="text-gray-700" />
                </div>
                <h3 className="text-2xl font-serif font-bold text-gray-600 mb-2">Ready for Action</h3>
                <p className="text-gray-700 max-w-md">
                  Masukkan ide cerita Anda dan tekan tombol Generate untuk memulai proses pre-produksi AI yang canggih.
                </p>
              </motion.div>
            )}

            {loading && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[600px] flex flex-col items-center justify-center text-center p-12 cinematic-card bg-black/40"
              >
                <div className="relative mb-8">
                  <div className="w-24 h-24 border-4 border-gold/20 border-t-gold rounded-full animate-spin"></div>
                  <Film className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gold animate-pulse" size={32} />
                </div>
                <h3 className="text-2xl font-serif font-bold text-white mb-4 animate-pulse">Directing AI Engine...</h3>
                <div className="space-y-2 text-gold/60 font-mono text-xs uppercase tracking-widest">
                  <p>Analyzing Story Beats</p>
                  <p>Building Casting Profiles</p>
                  <p>Calculating Shot Composition</p>
                  <p>Rendering Storyboard Prompts</p>
                </div>
              </motion.div>
            )}

            {error && (
              <motion.div 
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-8 cinematic-card border-gold/20 bg-gold/5 text-center"
              >
                <Zap className="text-gold mx-auto mb-4" size={40} />
                <h3 className="text-xl font-serif font-bold text-gold mb-2">System Status</h3>
                <p className="text-gray-400 mb-6">{error}</p>
                <div className="flex justify-center gap-4">
                  <button 
                    onClick={handleGenerateFilm}
                    className="cinematic-button-primary"
                  >
                    Retry Generation
                  </button>
                </div>
              </motion.div>
            )}

            {output && !loading && (
              <motion.div 
                key="output"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-12"
              >
                {/* LAYER 1 — CONCEPT LAYER (IDE KREATIF) */}
                {currentStep === 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="flex items-center gap-4 border-b-2 border-gold/30 pb-2">
                      <div className="w-10 h-10 bg-gold text-black rounded-full flex items-center justify-center font-bold text-xl">1</div>
                      <h2 className="text-2xl font-serif font-bold text-white uppercase tracking-wider">CONCEPT LAYER (IDE KREATIF)</h2>
                    </div>

                    {/* Master Concept Visual */}
                    <section className="cinematic-card overflow-hidden p-0">
                      <div className="relative aspect-video bg-gray-900 group">
                        {output.masterConceptImageUrl ? (
                          <img 
                            src={output.masterConceptImageUrl} 
                            alt="Master Concept" 
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-900">
                            <Loader2 className="animate-spin text-gold" size={40} />
                          </div>
                        )}
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setViewItem({ title: 'Master Concept', description: output.logline, imageUrl: output.masterConceptImageUrl, prompt: output.masterConceptPrompt })}
                            className="p-2 bg-black/60 hover:bg-gold/80 text-white hover:text-black rounded-full backdrop-blur-md transition-all"
                          >
                            <Eye size={18} />
                          </button>
                          <button 
                            onClick={() => handleGenerateImage('master', output.masterConceptPrompt, 'master' as any)}
                            className="p-2 bg-black/60 hover:bg-gold/80 text-white hover:text-black rounded-full backdrop-blur-md transition-all"
                          >
                            <RefreshCw size={18} className={generatingImages['master'] ? 'animate-spin' : ''} />
                          </button>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                        <div className="absolute bottom-8 left-8">
                          <h2 className="text-3xl font-serif font-bold text-gold mb-2">MASTER CONCEPT VISUAL</h2>
                          <p className="text-gray-400 text-sm uppercase tracking-widest">Cinematic Reference Frame</p>
                        </div>
                      </div>
                    </section>

                    {/* Story Core */}
                    <section className="cinematic-card overflow-hidden">
                      <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
                        <Layout className="text-gold" size={20} />
                        <h2 className="text-lg font-serif font-bold text-white">🎥 CONCEPT CORE</h2>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className="p-4 bg-black/40 rounded-xl border border-gray-800">
                            <label className="label-gold">📌 Story Core</label>
                            <h3 className="text-2xl font-serif font-bold text-gold mb-2">{output.title}</h3>
                            <p className="text-sm italic text-gray-400 mb-4">"{output.logline}"</p>
                            <div className="text-sm text-gray-300 leading-relaxed">
                              {output.synopsis}
                            </div>
                          </div>

                          <div className="p-4 bg-gold/5 rounded-xl border border-gold/20">
                            <label className="label-gold">🎯 Pesan Utama Film</label>
                            <p className="text-lg font-serif italic text-gold-light">
                              {output.mainMessage}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-black/40 rounded-xl border border-gray-800">
                              <label className="label-gold">🎭 Genre</label>
                              <p className="text-white font-serif">{input.genre}</p>
                            </div>
                            <div className="p-4 bg-black/40 rounded-xl border border-gray-800">
                              <label className="label-gold">🎨 Visual Style</label>
                              <p className="text-white font-serif">{input.style}</p>
                            </div>
                            <div className="p-4 bg-black/40 rounded-xl border border-gray-800">
                              <label className="label-gold">✨ Visual Effect</label>
                              <p className="text-white font-serif">{input.visualEffect}</p>
                            </div>
                            <div className="p-4 bg-black/40 rounded-xl border border-gray-800">
                              <label className="label-gold">📏 Aspect Ratio</label>
                              <p className="text-white font-serif">{input.aspectRatio}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <div className="flex justify-center">
                      <button 
                        onClick={handleGenerateCasting}
                        disabled={loading}
                        className="cinematic-button-primary px-12 flex items-center gap-3"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                        Lanjut ke Casting & Scene Layer →
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* LAYER 2 — CASTING & SCENE LAYER (PRODUKSI CERITA) */}
                {currentStep === 1 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="flex items-center gap-4 border-b-2 border-gold/30 pb-2">
                      <div className="w-10 h-10 bg-gold text-black rounded-full flex items-center justify-center font-bold text-xl">2</div>
                      <h2 className="text-2xl font-serif font-bold text-white uppercase tracking-wider">CASTING & SCENE LAYER (PRODUKSI CERITA)</h2>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Character Builder */}
                      <section className="cinematic-card lg:col-span-1">
                        <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
                          <Users className="text-gold" size={20} />
                          <h2 className="text-lg font-serif font-bold text-white">👥 Character Builder</h2>
                        </div>
                        <div className="markdown-body text-sm">
                          <ReactMarkdown>{output.characters}</ReactMarkdown>
                        </div>
                      </section>

                      {/* Emotions & Wardrobe */}
                      <section className="cinematic-card lg:col-span-2">
                        <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
                          <Zap className="text-gold" size={20} />
                          <h2 className="text-lg font-serif font-bold text-white">🎭 Mood & Style</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="p-4 bg-black/40 rounded-xl border border-gray-800">
                            <label className="label-gold">🧠 Emotions & Mood</label>
                            <p className="text-sm text-gray-300 leading-relaxed">{output.casting.emotions}</p>
                          </div>
                          <div className="p-4 bg-black/40 rounded-xl border border-gray-800">
                            <label className="label-gold">👕 Wardrobe Concept</label>
                            <p className="text-sm text-gray-300 leading-relaxed">{output.casting.wardrobe}</p>
                          </div>
                        </div>
                      </section>
                    </div>

                    {/* Casting Section */}
                    <section className="cinematic-card">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-gray-800 pb-4">
                        <div className="flex items-center gap-2">
                          <Users className="text-gold" size={20} />
                          <h2 className="text-lg font-serif font-bold text-white">🎭 CASTING & PRODUCTION</h2>
                        </div>
                        <button 
                          onClick={handleGenerateAllCasting}
                          className="text-[10px] text-gold hover:text-gold-light flex items-center gap-1 uppercase font-bold tracking-wider bg-gold/10 px-3 py-1.5 rounded-full border border-gold/20 transition-all hover:bg-gold/20"
                        >
                          <Zap size={12} /> Generate All Casting
                        </button>
                      </div>

                      <div className="space-y-8">
                        <div className="flex items-center gap-4 p-4 bg-black/30 rounded-xl border border-gray-800">
                          <div className="p-3 bg-gold/10 rounded-lg">
                            <Sun className="text-gold" size={24} />
                          </div>
                          <div>
                            <label className="label-gold mb-0">Setting Time</label>
                            <p className="text-lg font-serif text-white">{output.casting.time}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Actors */}
                          <div className="space-y-4">
                            <label className="label-gold flex items-center gap-2"><Users size={14} /> Actors</label>
                            {output.casting.actors.map((actor, idx) => (
                              <CastingCard 
                                key={idx}
                                item={actor}
                                onGenerate={(newPrompt) => handleGenerateImage(`actor-${idx}`, newPrompt || actor.visualPrompt, 'actor', idx)}
                                onUpload={(file) => handleUploadImage('actor', idx, file)}
                                onToggleLock={() => handleToggleLock('actor', idx)}
                                onUpdate={(field, value) => handleUpdateCastingItem('actor', idx, field, value)}
                                onView={() => setViewItem({ title: actor.name, description: actor.description, imageUrl: actor.imageUrl, prompt: actor.visualPrompt })}
                                isGenerating={generatingImages[`actor-${idx}`]}
                                onDownload={() => actor.imageUrl && downloadImage(actor.imageUrl, `${actor.name}.png`)}
                              />
                            ))}
                          </div>

                          {/* Locations */}
                          <div className="space-y-4">
                            <label className="label-gold flex items-center gap-2"><MapPin size={14} /> Locations</label>
                            {output.casting.locations.map((loc, idx) => (
                              <CastingCard 
                                key={idx}
                                item={loc}
                                onGenerate={(newPrompt) => handleGenerateImage(`loc-${idx}`, newPrompt || loc.visualPrompt, 'location', idx)}
                                onUpload={(file) => handleUploadImage('location', idx, file)}
                                onToggleLock={() => handleToggleLock('location', idx)}
                                onUpdate={(field, value) => handleUpdateCastingItem('location', idx, field, value)}
                                onView={() => setViewItem({ title: loc.name, description: loc.description, imageUrl: loc.imageUrl, prompt: loc.visualPrompt })}
                                isGenerating={generatingImages[`loc-${idx}`]}
                                onDownload={() => loc.imageUrl && downloadImage(loc.imageUrl, `${loc.name}.png`)}
                              />
                            ))}
                          </div>

                          {/* Elements */}
                          <div className="space-y-4">
                            <label className="label-gold flex items-center gap-2"><Box size={14} /> Elements</label>
                            {output.casting.elements.map((el, idx) => (
                              <CastingCard 
                                key={idx}
                                item={el}
                                onGenerate={(newPrompt) => handleGenerateImage(`el-${idx}`, newPrompt || el.visualPrompt, 'element', idx)}
                                onUpload={(file) => handleUploadImage('element', idx, file)}
                                onToggleLock={() => handleToggleLock('element', idx)}
                                onUpdate={(field, value) => handleUpdateCastingItem('element', idx, field, value)}
                                onView={() => setViewItem({ title: el.name, description: el.description, imageUrl: el.imageUrl, prompt: el.visualPrompt })}
                                isGenerating={generatingImages[`el-${idx}`]}
                                onDownload={() => el.imageUrl && downloadImage(el.imageUrl, `${el.name}.png`)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Scene Breakdown */}
                    <section className="cinematic-card">
                      <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
                        <Clapperboard className="text-gold" size={20} />
                        <h2 className="text-lg font-serif font-bold text-white">🎬 Scene Breakdown</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {output.scenes.map((scene) => (
                          <div key={scene.number} className="p-4 bg-black/30 rounded-lg border border-gray-800 hover:border-gold/30 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-6 h-6 bg-gold text-black text-[10px] font-bold rounded flex items-center justify-center">
                                {scene.number}
                              </span>
                              <h4 className="font-bold text-white text-sm">{scene.title}</h4>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed">{scene.description}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="flex justify-center">
                      <button 
                        onClick={handleGenerateShotlist}
                        disabled={loading}
                        className="cinematic-button-primary px-12 flex items-center gap-3"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                        Lanjut ke Shotlist Layer →
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* LAYER 3 — SHOTLIST LAYER (EKSEKUSI KAMERA) */}
                {currentStep === 2 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="flex items-center gap-4 border-b-2 border-gold/30 pb-2">
                      <div className="w-10 h-10 bg-gold text-black rounded-full flex items-center justify-center font-bold text-xl">3</div>
                      <h2 className="text-2xl font-serif font-bold text-white uppercase tracking-wider">SHOTLIST LAYER (EKSEKUSI KAMERA)</h2>
                    </div>

                    {/* Shotlist Detail */}
                    <section className="cinematic-card">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-gray-800 pb-4">
                        <div className="flex items-center gap-2">
                          <Camera className="text-gold" size={20} />
                          <h2 className="text-lg font-serif font-bold text-white">🎥 Shotlist Detail</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={handleGenerateAllShotImages}
                            className="text-[10px] text-gold hover:text-gold-light flex items-center gap-1 uppercase font-bold tracking-wider bg-gold/10 px-3 py-1.5 rounded-full border border-gold/20 transition-all hover:bg-gold/20"
                          >
                            <Zap size={12} /> Generate All Images
                          </button>
                        </div>
                      </div>
                      <div className="space-y-4">
                        {output.shots.map((shot, idx) => (
                          <ShotCard 
                            key={shot.number}
                            shot={shot}
                            onGenerate={(newPrompt) => handleGenerateImage(`shot-${idx}`, newPrompt || shot.visualPrompt, 'shot', idx)}
                            onToggleLock={() => handleToggleLock('shot', idx)}
                            onView={() => setViewItem({ title: `Shot ${shot.number}`, description: shot.description, imageUrl: shot.imageUrl, prompt: shot.visualPrompt })}
                            isGenerating={generatingImages[`shot-${idx}`]}
                            onDownload={() => shot.imageUrl && downloadImage(shot.imageUrl, `shot-${shot.number}.png`)}
                          />
                        ))}
                      </div>
                    </section>

                    {/* Timeline Visualization */}
                    <section className="cinematic-card">
                      <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
                        <div className="flex items-center gap-2">
                          <Clock className="text-gold" size={20} />
                          <h2 className="text-lg font-serif font-bold text-white">⏱ CINEMATIC TIMELINE</h2>
                        </div>
                      </div>
                      <div className="relative h-24 bg-black/50 rounded-xl border border-gray-800 p-4 flex items-center gap-1 overflow-x-auto">
                        {output.shots.map((shot, i) => (
                          <div 
                            key={shot.number}
                            className="flex-shrink-0 group relative"
                            style={{ width: `${Math.max(40, 100 / output.shots.length)}%` }}
                          >
                            <div className="h-8 bg-gold/20 border-l border-gold/40 group-hover:bg-gold/40 transition-all cursor-help"></div>
                            <span className="absolute -top-6 left-0 text-[8px] font-mono text-gray-600">S{shot.number}</span>
                            
                            <div className="opacity-0 group-hover:opacity-100 absolute -bottom-16 left-0 z-50 w-48 p-2 bg-black border border-gold/50 rounded shadow-2xl pointer-events-none transition-opacity">
                              <p className="text-[10px] text-gold font-bold mb-1">Shot {shot.number}</p>
                              <p className="text-[9px] text-gray-300 leading-tight">{shot.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Social & Formats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <section className="cinematic-card">
                        <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
                          <Share2 className="text-gold" size={20} />
                          <h2 className="text-lg font-serif font-bold text-white">📱 Caption Generator</h2>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="label-gold">Short Caption</label>
                            <div className="p-3 bg-black/30 rounded border border-gray-800 text-xs text-gray-400">
                              {output.captions.short}
                            </div>
                          </div>
                          <div>
                            <label className="label-gold">Viral Caption</label>
                            <div className="p-3 bg-black/30 rounded border border-gray-800 text-xs text-gray-400">
                              {output.captions.viral}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="cinematic-card">
                        <div className="flex items-center gap-2 mb-6 border-b border-gray-800 pb-4">
                          <FileText className="text-gold" size={20} />
                          <h2 className="text-lg font-serif font-bold text-white">📖 Story Formats</h2>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="label-gold">Reels Script</label>
                            <div className="p-3 bg-black/30 rounded border border-gray-800 text-xs text-gray-400 whitespace-pre-wrap">
                              {output.formats.reels}
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>

                    <div className="flex justify-center pt-8">
                      <button 
                        onClick={() => {
                          setInput(INITIAL_INPUT);
                          setOutput(null);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="cinematic-button-primary px-12 flex items-center gap-3"
                      >
                        <Check size={20} />
                        Save and Back to Initial
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
            </div>
          </main>

      {/* Project List Modal */}
      <AnimatePresence>
        {showProjectList && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            onClick={() => setShowProjectList(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="cinematic-card w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
                <div className="flex items-center gap-2">
                  <FolderOpen className="text-gold" size={24} />
                  <h2 className="text-xl font-serif font-bold text-white">MY PROJECTS</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={createNewProject}
                    className="p-2 bg-gold text-black rounded-full hover:bg-gold-light"
                    title="New Project"
                  >
                    <Plus size={20} />
                  </button>
                  <button 
                    onClick={() => setShowProjectList(false)}
                    className="p-2 text-gray-400 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {!user ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="mb-4">Please login to manage your projects.</p>
                    <button onClick={login} className="cinematic-button-primary">Login with Google</button>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No projects found. Create your first cinematic masterpiece!</p>
                  </div>
                ) : (
                  projects.map((project) => (
                    <div 
                      key={project.id}
                      className={cn(
                        "p-4 rounded-xl border transition-all flex items-center justify-between group cursor-pointer",
                        currentProjectId === project.id ? "border-gold bg-gold/5" : "border-gray-800 bg-black/40 hover:border-gray-600"
                      )}
                      onClick={() => loadProject(project)}
                    >
                      <div className="flex-1">
                        <h3 className="text-white font-bold">{project.name}</h3>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                          Last updated: {new Date(project.lastUpdated).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); duplicateProject(project); }}
                          className="p-2 text-gold hover:bg-gold/10 rounded-full"
                          title="Duplicate Project"
                        >
                          <Copy size={18} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                          className="p-2 text-red-500 hover:bg-red-500/10 rounded-full"
                          title="Delete Project"
                        >
                          <Trash2 size={18} />
                        </button>
                        <ChevronRight size={18} className="text-gray-600" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Modal */}
      <AnimatePresence>
        {viewItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
            onClick={() => setViewItem(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative aspect-video bg-black">
                {viewItem.imageUrl ? (
                  <img src={viewItem.imageUrl} alt={viewItem.title} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-800">
                    <ImageIcon size={64} />
                  </div>
                )}
                <button 
                  onClick={() => setViewItem(null)}
                  className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-8 space-y-4">
                <h3 className="text-3xl font-serif font-bold text-gold">{viewItem.title}</h3>
                <p className="text-gray-300 leading-relaxed">{viewItem.description}</p>
                {viewItem.prompt && (
                  <div className="p-4 bg-black/40 rounded-xl border border-gray-800">
                    <label className="label-gold text-[10px]">Visual Prompt</label>
                    <p className="text-xs text-gray-500 font-mono italic">{viewItem.prompt}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto mt-20 pt-8 border-t border-gray-900 text-center">
        <p className="text-gray-600 text-[10px] uppercase tracking-[0.3em] font-bold">
          Powered by Gemini 3.1 Pro • AI Film Production Engine
        </p>
      </footer>
    </div>
  );
}

function ShotCard({ 
  shot, 
  onGenerate, 
  onToggleLock,
  onView,
  isGenerating, 
  onDownload
}: {
  shot: Shot,
  onGenerate: (newPrompt?: string) => void,
  onToggleLock: () => void,
  onView: () => void,
  isGenerating: boolean,
  onDownload: () => void
}) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState(shot.visualPrompt);
  const [copied, setCopied] = useState(false);

  const handleCopyVideoPrompt = () => {
    if (shot.videoVisualPrompt) {
      navigator.clipboard.writeText(shot.videoVisualPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn(
      "p-4 bg-black/30 rounded-xl border transition-all flex flex-col md:flex-row gap-6",
      shot.locked ? "border-gold/50 bg-gold/5" : "border-gray-800"
    )}>
      <div className="w-full md:w-48 h-32 bg-gray-900 rounded-lg overflow-hidden relative group shrink-0">
        {shot.imageUrl ? (
          <img src={shot.imageUrl} alt={`Shot ${shot.number}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
            <ImageIcon size={24} />
            <span className="text-[10px] mt-1">No Image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button 
            onClick={() => onGenerate()}
            disabled={isGenerating}
            className="p-2 bg-gold text-black rounded-full hover:bg-gold-light"
            title="Regenerate Image"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
          <button 
            onClick={() => setIsRefining(!isRefining)}
            className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-400"
            title="Refine Prompt"
          >
            <Wand2 size={16} />
          </button>
          <button 
            onClick={onView}
            className="p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-400"
            title="View Full"
          >
            <Eye size={16} />
          </button>
          {shot.imageUrl && (
            <button 
              onClick={onDownload}
              className="p-2 bg-white text-black rounded-full hover:bg-gray-200"
              title="Download Image"
            >
              <Download size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <label className="label-gold mb-0">Shot {shot.number}</label>
              <button 
                onClick={onToggleLock}
                className={cn("p-1 rounded-full transition-colors", shot.locked ? "text-gold bg-gold/20" : "text-gray-600 hover:text-gray-400")}
              >
                {shot.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            </div>
            <p className="text-sm font-bold text-white">{shot.camera}</p>
            <p className="text-[10px] text-gray-500">{shot.scene}</p>
          </div>
          <button 
            onClick={handleCopyVideoPrompt}
            className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-full text-[10px] text-gray-400 transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? 'Copied Video Prompt' : 'Copy Video Prompt'}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="label-gold mb-1">Movement</label>
            <p className="text-xs text-gray-300">{shot.movement}</p>
          </div>
          <div>
            <label className="label-gold mb-1">Transition</label>
            <p className="text-xs text-gray-300">{shot.transition}</p>
          </div>
          <div className="col-span-2 md:col-span-1">
            <label className="label-gold mb-1">Description</label>
            <p className="text-xs text-gray-400 leading-tight">{shot.description}</p>
          </div>
        </div>

        {shot.videoVisualPrompt && (
          <div className="p-4 bg-blue-950/30 rounded-xl border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <label className="label-gold mb-2 flex items-center gap-2 text-blue-400">
              <Sparkles size={14} /> EMBEDDED CINEMATIC PROMPT
            </label>
            <p className="text-sm text-blue-100 font-medium leading-relaxed tracking-wide">
              {shot.videoVisualPrompt}
            </p>
          </div>
        )}

        <AnimatePresence>
          {isRefining && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 p-2 bg-black/20 rounded border border-gray-800">
                <input 
                  type="text" 
                  className="cinematic-input flex-1 text-xs py-1 px-3"
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  placeholder="Refine visual prompt..."
                />
                <button 
                  onClick={() => {
                    onGenerate(refinePrompt);
                    setIsRefining(false);
                  }}
                  className="bg-gold text-black px-3 py-1 rounded text-xs font-bold hover:bg-gold-light"
                >
                  Generate
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CastingCard({ item, onGenerate, onUpload, onToggleLock, onUpdate, onView, isGenerating, onDownload }: { 
  item: CastingItem, 
  onGenerate: (newPrompt?: string) => void, 
  onUpload: (file: File) => void,
  onToggleLock: () => void,
  onUpdate: (field: string, value: string) => void,
  onView: () => void,
  isGenerating: boolean,
  onDownload: () => void
}) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState(item.visualPrompt);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn(
      "p-3 bg-black/40 rounded-xl border transition-all space-y-3 group",
      item.locked ? "border-gold/50 bg-gold/5" : "border-gray-800"
    )}>
      <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
            <ImageIcon size={20} />
            <span className="text-[8px] mt-1 uppercase font-bold tracking-tighter">No Visual</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button 
            onClick={() => onGenerate()}
            disabled={isGenerating}
            className="p-2 bg-gold text-black rounded-full hover:bg-gold-light"
            title="Regenerate Image"
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button 
            onClick={() => setIsRefining(!isRefining)}
            className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-400"
            title="Refine Prompt"
          >
            <Wand2 size={14} />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-orange-500 text-white rounded-full hover:bg-orange-400"
            title="Upload Image"
          >
            <ImageIcon size={14} />
          </button>
          <button 
            onClick={onView}
            className="p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-400"
            title="View Full"
          >
            <Eye size={14} />
          </button>
          {item.imageUrl && (
            <button 
              onClick={onDownload}
              className="p-2 bg-white text-black rounded-full hover:bg-gray-200"
              title="Download Image"
            >
              <Download size={14} />
            </button>
          )}
        </div>
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
          }}
        />
      </div>
      
      <AnimatePresence>
        {isRefining && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 mt-2">
              <input 
                type="text" 
                className="cinematic-input flex-1 text-[10px] py-1 px-2"
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
              />
              <button 
                onClick={() => {
                  onGenerate(refinePrompt);
                  setIsRefining(false);
                }}
                className="bg-gold text-black p-1 rounded hover:bg-gold-light"
              >
                <Zap size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <input 
            type="text"
            className="bg-transparent border-none text-sm font-bold text-white p-0 w-full focus:ring-0"
            value={item.name}
            onChange={(e) => onUpdate('name', e.target.value)}
            placeholder="Name..."
          />
          <textarea 
            className="bg-transparent border-none text-[10px] text-gray-500 leading-tight p-0 w-full focus:ring-0 resize-none h-10"
            value={item.description}
            onChange={(e) => onUpdate('description', e.target.value)}
            placeholder="Description..."
          />
        </div>
        <button 
          onClick={onToggleLock}
          className={cn("p-1 rounded-full transition-colors shrink-0", item.locked ? "text-gold bg-gold/20" : "text-gray-600 hover:text-gray-400")}
          title={item.locked ? "Unlock Casting" : "Lock Casting"}
        >
          {item.locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
      </div>
    </div>
  );
}
