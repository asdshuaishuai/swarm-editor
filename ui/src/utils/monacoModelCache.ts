interface GetOrCreateModelOptions {
  path: string
  content: string
  lang: string
  monaco: any
  modelCache: Map<string, any>
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
