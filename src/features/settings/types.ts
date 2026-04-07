export interface WebDavSettings {
  enabled: boolean
  rootUrl: string
  username: string
  password: string
  autoPullOnOpen: boolean
  autoPushOnSave: boolean
  autoPushMinIntervalSeconds: number
}

export const DEFAULT_WEB_DAV_SETTINGS: WebDavSettings = {
  enabled: false,
  rootUrl: "",
  username: "",
  password: "",
  autoPullOnOpen: true,
  autoPushOnSave: true,
  autoPushMinIntervalSeconds: 120,
}
