import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore } from '../store/appStore'
import { FolderTree, PanelLeft, Play, Save } from 'lucide-react'

export default function EditorPanel() {
  useAppStore()
  const [code, setCode] = useState(`// Welcome to Swarm Editor
// A multi-agent collaborative development environment

function main() {
  console.log("Hello, Swarm!")
}

main()
`)
  const [language, setLanguage] = useState('typescript')
  const [showFileTree, setShowFileTree] = useState(true)

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 bg-panel-bg border-b border-panel-border">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFileTree(!showFileTree)}
            className="p-1 hover:bg-panel-border rounded"
            title="Toggle File Tree"
          >
            <PanelLeft size={16} />
          </button>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-editor-bg border border-panel-border rounded px-2 py-0.5 text-xs"
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
            <option value="json">JSON</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <button className="flex items-center space-x-1 px-2 py-1 hover:bg-panel-border rounded text-xs">
            <Save size={14} />
            <span>Save</span>
          </button>
          <button className="flex items-center space-x-1 px-2 py-1 bg-accent hover:bg-accent-hover rounded text-xs">
            <Play size={14} />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree */}
        {showFileTree && (
          <div className="w-48 bg-panel-bg border-r border-panel-border overflow-y-auto">
            <div className="p-2 text-xs text-text-secondary font-semibold border-b border-panel-border">
              EXPLORER
            </div>
            <div className="p-1">
              <FileTreeNode name="src" type="folder" level={0} />
              <FileTreeNode name="main.ts" type="file" level={1} active />
              <FileTreeNode name="utils.ts" type="file" level={1} />
              <FileTreeNode name="types.ts" type="file" level={1} />
              <FileTreeNode name="package.json" type="file" level={0} />
              <FileTreeNode name="README.md" type="file" level={0} />
            </div>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={handleEditorChange}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
            }}
          />
        </div>
      </div>
    </div>
  )
}

interface FileTreeNodeProps {
  name: string
  type: 'file' | 'folder'
  level: number
  active?: boolean
}

function FileTreeNode({ name, type, level, active }: FileTreeNodeProps) {
  return (
    <div
      className={`flex items-center px-1 py-0.5 text-xs cursor-pointer hover:bg-panel-border rounded ${
        active ? 'bg-accent/20 text-accent' : 'text-text-primary'
      }`}
      style={{ paddingLeft: `${level * 12 + 4}px` }}
    >
      {type === 'folder' ? (
        <FolderTree size={14} className="mr-1 text-warning" />
      ) : (
        <FolderTree size={14} className="mr-1 text-text-secondary" />
      )}
      <span>{name}</span>
    </div>
  )
}