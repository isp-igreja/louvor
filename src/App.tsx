import React, { useState, useEffect, useRef } from 'react';
import { Octokit } from 'octokit';
import { FolderOpen, FileText, Copy, Share2, Search, X, Check } from 'lucide-react';
import QRCode from 'react-qr-code';

const octokit = new Octokit();

type GitHubContent = {
  name: string;
  path: string;
  type: string;
  sha: string;
};

function sendEventToWebhook(eventType: string) {
  fetch("https://eo4d3fqhrhazl81.m.pipedream.net", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event: eventType
    }),
  });
}

const normalizeText = (text: string): string => {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

function App() {
  const [path, setPath] = useState<string>('');
  const [contents, setContents] = useState<GitHubContent[]>([]);
  const [lyrics, setLyrics] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [allFiles, setAllFiles] = useState<GitHubContent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentSong, setCurrentSong] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const getAllFiles = async (items: GitHubContent[], accumulator: GitHubContent[]) => {
    for (const item of items) {
      if (item.type === 'file' && item.name.endsWith('.txt')) {
        accumulator.push(item);
      } else if (item.type === 'dir') {
        try {
          const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: 'isp-igreja',
            repo: 'louvor',
            path: item.path,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          });
          if (Array.isArray(response.data)) {
            await getAllFiles(response.data, accumulator);
          }
        } catch (error) {
          console.error(`Error fetching contents of ${item.path}:`, error);
        }
      }
    }
  };

  const fetchAllFiles = async () => {
    try {
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'isp-igreja',
        repo: 'louvor',
        path: 'musicas',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (Array.isArray(response.data)) {
        const files: GitHubContent[] = [];
        await getAllFiles(response.data, files);
        setAllFiles(files.filter(file => file.name.endsWith('.txt')));
      }
    } catch (error) {
      console.error('Error fetching all files:', error);
    }
  };

  const fetchContents = async (path: string = '') => {
    try {
      setError('');
      const repoPath = path || 'musicas';
      const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'isp-igreja',
        repo: 'louvor',
        path: repoPath,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (Array.isArray(response.data)) {
        const filteredData = response.data.filter(item =>
          item.type === 'dir' || (item.type === 'file' && item.name.endsWith('.txt'))
        );
        setContents(filteredData);
      } else if (response.data.type === 'file') {
        const base64Content = response.data.content.replace(/\n/g, '');
        const decodedContent = decodeURIComponent(escape(atob(base64Content)));
        setLyrics(decodedContent);
        setCurrentSong(response.data.name.replace('.txt', ''));

        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('song', path);
        setCurrentUrl(newUrl.toString());
      }
    } catch (error) {
      console.error('Error fetching contents:', error);
      setError('Erro ao buscar músicas');
      setContents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialContent = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const songPath = urlParams.get('song');

      if (!songPath) {
        sendEventToWebhook("home_page_visit");
      }

      // Always fetch all files first for search functionality
      await fetchAllFiles();

      if (songPath) {
        await fetchContents(songPath);
      } else {
        await fetchContents();
      }
    };

    loadInitialContent();

    const handlePopState = () => {
      loadInitialContent();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowModal(false);
        setIsLinkCopied(false);
      }
    };

    if (showModal) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModal]);

  const handleItemClick = async (item: GitHubContent) => {
    try {
      setIsLoading(true);
      if (item.type === 'dir') {
        setLyrics('');
        setCurrentSong('');
        setPath(item.path);
        await fetchContents(item.path);
      } else {
        await fetchContents(item.path);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('song', item.path);
        setCurrentUrl(newUrl.toString());
        window.history.pushState({}, '', newUrl.toString());
      }
      setSearchTerm('');
    } catch (error) {
      console.error('Error handling item click:', error);
      setError('Erro ao acessar o item selecionado');
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const copyToClipboard = (text: string, isLink: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isLink) {
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    } else {
      setIsCopied(true);
      sendEventToWebhook("copy_button_click");
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleHomeClick = async () => {
    setIsLoading(true);
    setPath('');
    setLyrics('');
    setCurrentSong('');
    setSearchTerm('');
    window.history.pushState({}, '', window.location.pathname);
    await fetchContents();
  };

  const handleShareClick = () => {
    setShowModal(true);
    sendEventToWebhook("share_button_click");
  };

  const filteredContents = searchTerm
    ? allFiles.filter(item => {
        const normalizedName = normalizeText(item.name.toLowerCase().replace('.txt', ''));
        const normalizedPath = normalizeText(item.path.toLowerCase());
        const normalizedSearch = normalizeText(searchTerm.toLowerCase());
        return normalizedName.includes(normalizedSearch) || normalizedPath.includes(normalizedSearch);
      })
    : contents;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="mb-4">
            <button
              onClick={handleHomeClick}
              className="text-gray-800 hover:text-blue-600 transition-colors"
            >
              <h1 className="text-2xl font-bold">Louvor ISP</h1>
            </button>
          </div>

          <div className="mb-4" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" strokeWidth={1.5} />
              <input
                type="text"
                placeholder="Buscar músicas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : lyrics && !searchTerm ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-700">{currentSong}</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => copyToClipboard(lyrics)}
                    className={`flex items-center px-3 py-1.5 rounded-lg transition-all duration-200 ${
                      isCopied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                        Copiar
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleShareClick}
                    className="flex items-center px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Share2 className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                    Compartilhar
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-lg text-sm">
                {lyrics}
              </pre>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredContents.length > 0 ? (
                filteredContents.map((item) => (
                  <button
                    key={item.sha}
                    onClick={() => handleItemClick(item)}
                    className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  >
                    {item.type === 'dir' ? (
                      <FolderOpen className="w-4 h-4 text-yellow-500 mr-2" strokeWidth={1.5} />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-500 mr-2" strokeWidth={1.5} />
                    )}
                    <span className="text-gray-700 text-sm">
                      {item.type === 'file' ? item.name.replace('.txt', '') : item.name}
                    </span>
                  </button>
                ))
              ) : (
                <div className="col-span-2 text-center py-8 text-gray-500">
                  Nenhum arquivo encontrado
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div ref={modalRef} className="bg-white rounded-lg p-4 max-w-sm w-full">
            <h2 className="text-lg font-bold mb-3">Compartilhar Música</h2>
            <div className="flex justify-center mb-4">
              <QRCode value={currentUrl} size={200} />
            </div>
            <button
              onClick={() => copyToClipboard(currentUrl, true)}
              className={`w-full py-2 rounded-lg text-sm transition-all duration-200 ${
                isLinkCopied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              <div className="flex items-center justify-center">
                {isLinkCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                    Link Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                    Copiar Link
                  </>
                )}
              </div>
            </button>
            <button
              onClick={() => {
                setShowModal(false);
                setIsLinkCopied(false);
              }}
              className="w-full mt-2 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
