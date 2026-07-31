describe('fabricSnapshotReconcile text safety', () => {
  type FabricJsonObject = Record<string, unknown>;

  function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\u200b/g, '').trim();
  }

  function isTextLike(obj: FabricJsonObject): boolean {
    const type = String(obj.type ?? '').toLowerCase();
    return type === 'i-text' || type === 'textbox' || type === 'text';
  }

  function readId(obj: FabricJsonObject): string {
    return String(obj.id ?? '').trim();
  }

  function collectById(objects: FabricJsonObject[]): Map<string, FabricJsonObject> {
    const map = new Map<string, FabricJsonObject>();
    for (const obj of objects) {
      const id = readId(obj);
      if (id) map.set(id, obj);
    }
    return map;
  }

  function getObjects(fabricJSON: unknown): FabricJsonObject[] {
    if (!fabricJSON || typeof fabricJSON !== 'object' || Array.isArray(fabricJSON)) return [];
    const objects = (fabricJSON as FabricJsonObject).objects;
    return Array.isArray(objects)
      ? objects.filter((obj): obj is FabricJsonObject => !!obj && typeof obj === 'object' && !Array.isArray(obj))
      : [];
  }

  function preserveTextContentWhenSavedEmpty(
    previousObjects: FabricJsonObject[],
    savedObjects: FabricJsonObject[],
  ): FabricJsonObject[] {
    const prevById = collectById(previousObjects);
    return savedObjects.map((obj) => {
      const id = readId(obj);
      if (!id || !isTextLike(obj)) return obj;
      const prev = prevById.get(id);
      if (!prev || !isTextLike(prev)) return obj;
      const prevText = normalizeText(prev.text);
      const savedText = normalizeText(obj.text);
      if (prevText && !savedText && prevText !== savedText) {
        return { ...obj, text: prev.text };
      }
      return obj;
    });
  }

  function reconcilePhotoFieldSnapshotLoss(
    previous: Record<string, unknown> | undefined,
    saved: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!previous) return saved;
    const previousObjects = getObjects(previous);
    const savedObjects = getObjects(saved);
    if (previousObjects.length === 0 || savedObjects.length === 0) return saved;
    return {
      ...saved,
      objects: preserveTextContentWhenSavedEmpty(previousObjects, savedObjects),
    };
  }

  function reconcileDesignPagesTextLoss(
    previousPages: Array<{ fabricJSON: Record<string, unknown> }> | undefined,
    nextPages: Array<{ fabricJSON: Record<string, unknown> }>,
  ): Array<{ fabricJSON: Record<string, unknown> }> {
    if (!previousPages?.length) return nextPages;
    return nextPages.map((page, index) => ({
      ...page,
      fabricJSON: reconcilePhotoFieldSnapshotLoss(previousPages[index]?.fabricJSON, page.fabricJSON),
    }));
  }

  it('preserves previous non-empty text when saved snapshot is empty', () => {
    const previous = {
      objects: [
        { id: 'text_1', type: 'textbox', text: 'Happy birthday' },
      ],
    };
    const saved = {
      objects: [
        { id: 'text_1', type: 'textbox', text: '' },
      ],
    };

    const reconciled = reconcilePhotoFieldSnapshotLoss(previous, saved);
    const objects = Array.isArray(reconciled.objects) ? reconciled.objects : [];
    expect((objects[0] as { text?: string } | undefined)?.text).toBe('Happy birthday');
  });

  it('reconciles pages[] and restores empty text from last persisted state', () => {
    const previousPages = [
      {
        fabricJSON: {
          objects: [
            { id: 'text_1', type: 'textbox', text: 'Alice and Bob' },
          ],
        },
      },
    ];
    const nextPages = [
      {
        fabricJSON: {
          objects: [
            { id: 'text_1', type: 'textbox', text: '' },
          ],
        },
      },
    ];

    const reconciled = reconcileDesignPagesTextLoss(previousPages as any, nextPages as any);
    const objects = Array.isArray(reconciled[0]?.fabricJSON?.objects)
      ? reconciled[0].fabricJSON.objects
      : [];
    expect((objects[0] as { text?: string } | undefined)?.text).toBe('Alice and Bob');
  });
});

