interface TextModel {
  uri: string
  content: string
  disposed?: boolean
  dispose(): void
}

interface MonacoAPI {
  Uri: { file(path: string): { toString(): string } }
  editor: {
    getModel(uri: { toString(): string }): TextModel | null
    createModel(content: string, language: string, uri: { toString(): string }): TextModel
  }
}

interface GetOrCreateModelOptions {
  path: string
  content: string
  lang: string
  monaco: MonacoAPI
  modelCache: Map<string, TextModel>
}

export function getOrCreateModel(options: GetOrCreateModelOptions) {
  const { path, content, lang, monaco, modelCache } = options
  const uri = monaco.Uri.file(path)

  const cachedModel = modelCache.get(path)
  if (cachedModel) return cachedModel

  const existingModel = monaco.editor.getModel(uri)
  if (existingModel) {
    modelCache.set(path, existingModel)
    return existingModel
  }

  const newModel = monaco.editor.createModel(content, lang, uri)
  modelCache.set(path, newModel)
  return newModel
}
