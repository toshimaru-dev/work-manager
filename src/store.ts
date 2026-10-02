import * as vscode from 'vscode';
import { AppData, DataKey, normalizeData } from './shared/types';

const STORAGE_KEY = 'workManager.data';

/** globalState を使った永続化。全ワークスペース共通のデータとして保存する。 */
export class Store {
  private readonly emitter = new vscode.EventEmitter<AppData>();
  readonly onDidChange = this.emitter.event;

  constructor(private readonly memento: vscode.Memento) {}

  get(): AppData {
    return normalizeData(this.memento.get<Partial<AppData>>(STORAGE_KEY));
  }

  async set<K extends DataKey>(key: K, value: AppData[K]): Promise<void> {
    await this.replace({ ...this.get(), [key]: value });
  }

  async replace(data: AppData): Promise<void> {
    await this.memento.update(STORAGE_KEY, data);
    this.emitter.fire(data);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
