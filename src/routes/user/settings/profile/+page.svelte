<script lang="ts">
    import * as api from '$lib/api';
    import { meId } from '$lib/store/session.svelte';
    import * as usersStore from '$lib/store/users.svelte';
    import * as emojisStore from '$lib/store/emojis.svelte';
    import { fileToBase64 } from '$lib/utils/upload';
    import { insertEmojiAtSelection, type EmojiOption } from '$lib/utils/emojis';
    import { blobToUrl, mimeToFormat, mediaUrl } from '$lib/utils/media';
    import type { UserProfile, UserSummary } from '$lib/types';
    import Icon from '$lib/components/Icon.svelte';
    import Avatar from '$lib/components/Avatar.svelte';
    import EmojiPicker from '$lib/components/EmojiPicker.svelte';

    let profile: UserProfile | null = $state(null);
    let nickname = $state('');
    let statusMessage = $state('');
    let description = $state('');
    let descriptionEmojiOpen = $state(false);
    let descriptionEl: HTMLTextAreaElement | null = null;
    let avatarImg: { base64: string; mime: string } | null = $state(null);
    let bannerImg: { base64: string; mime: string } | null = $state(null);
    let avatarError = $state('');
    let bannerError = $state('');
    let removeAvatar = $state(false);
    let removeBanner = $state(false);
    let saving = $state(false);
    let showSaving = $state(false);
    let saved = $state(false);
    let savingFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
    let savedTimer: ReturnType<typeof setTimeout> | null = null;
    let error = $state<string | null>(null);
    let seeded = $state(false);

    // Previews: o upload pendente (avatarImg/bannerImg) ganha prioridade; senão,
    // usa o valor já persistido no perfil. O acesso aos $state nulos é feito
    // em funções regulares; o $derived mantém a reatividade.
    function previewAvatar(): string {
        if (removeAvatar) return '';
        if (avatarImg) {
            return blobToUrl(avatarImg.base64, mimeToFormat(avatarImg.mime));
        }
        if (profile?.avatar_blob) {
            return blobToUrl(profile.avatar_blob, profile.avatar_format);
        }
        return '';
    }

    function previewBanner(): string {
        if (removeBanner) return '';
        if (bannerImg) {
            return blobToUrl(bannerImg.base64, mimeToFormat(bannerImg.mime));
        }
        if (profile?.banner_media) {
            return mediaUrl(profile.banner_media);
        }
        return '';
    }

    function showName(): string {
        return nickname || (profile?.username ?? 'Usuário');
    }

    function userHandle(): string {
        return profile?.username ?? '';
    }

    const avatarSrc = $derived(previewAvatar());
    const bannerSrc = $derived(previewBanner());
    const displayName = $derived(showName());
    const atUsername = $derived(userHandle());

    // Semeia o formulário a partir do perfil (whoami + GET /users/:me).
    $effect(() => {
        const id = meId();
        if (!id || seeded) {
            return;
        }
        void loadProfile(id);
    });

    async function loadProfile(id: string): Promise<void> {
        try {
            const p = await usersStore.ensureProfile(id);
            profile = p;
            nickname = p.nickname ?? '';
            statusMessage = p.status_message ?? '';
            description = p.description ?? '';
        } catch {
            // Fallback: apenas os campos que o whoami expõe (description/capa
            // ficam vazios — o perfil não foi carregado).
            nickname = '';
            statusMessage = '';
            description = '';
        }
        seeded = true;
    }

    function toggleDescriptionEmoji(): void {
        descriptionEmojiOpen = !descriptionEmojiOpen;
        if (descriptionEmojiOpen && !emojisStore.state.fullyLoaded && !emojisStore.state.loading) {
            void emojisStore.loadAll().catch(() => {});
        }
    }

    function onPickDescriptionEmoji(emoji: EmojiOption): void {
        const start = descriptionEl?.selectionStart ?? description.length;
        const end = descriptionEl?.selectionEnd ?? description.length;
        const inserted = insertEmojiAtSelection(description, start, end, emoji);
        description = inserted.text;

        queueMicrotask(() => {
            if (!descriptionEl) return;
            const cursor = inserted.cursor;
            descriptionEl.selectionStart = cursor;
            descriptionEl.selectionEnd = cursor;
            descriptionEl.focus();
        });
    }

    async function onAvatarSelect(e: Event): Promise<void> {
        avatarError = '';
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        try {
            avatarImg = await fileToBase64(file, 'avatar');
            removeAvatar = false;
        } catch (err) {
            avatarError = (err as Error).message;
            avatarImg = null;
        }
    }

    async function onBannerSelect(e: Event): Promise<void> {
        bannerError = '';
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        try {
            bannerImg = await fileToBase64(file, 'banner');
            removeBanner = false;
        } catch (err) {
            bannerError = (err as Error).message;
            bannerImg = null;
        }
    }

    async function save(): Promise<void> {
        const id = meId();
        if (!id || saving) {
            return;
        }
        error = null;
        saved = false;
        saving = true;
        showSaving = false;
        if (savingFeedbackTimer) clearTimeout(savingFeedbackTimer);
        if (savedTimer) clearTimeout(savedTimer);
        // Evita o flash de “Salvando…” quando a resposta da API é quase instantânea.
        savingFeedbackTimer = setTimeout(() => {
            if (saving) showSaving = true;
        }, 220);
        try {
            await api.users.update(id, {
                nickname,
                status: statusMessage,
                description,
                typing: null
            });

            if (removeAvatar) {
                await api.users.updateAvatar(id, { avatar: '', avatar_format: '' });
            } else if (avatarImg) {
                await api.users.updateAvatar(id, {
                    avatar: avatarImg.base64,
                    avatar_format: mimeToFormat(avatarImg.mime)
                });
            }
            if (removeBanner) {
                await api.users.updateBanner(id, { banner: '', banner_format: '' });
            } else if (bannerImg) {
                await api.users.updateBanner(id, {
                    banner: bannerImg.base64,
                    banner_format: mimeToFormat(bannerImg.mime)
                });
            }

            // Atualiza os caches (o updateBanner retorna apenas a mensagem; o
            // sha da capa vem do refetch do perfil).
            const fresh = await api.users.profile(id);
            profile = fresh;
            usersStore.state.profiles.set(id, fresh);
            const summary = {
                id: fresh.id,
                username: fresh.username,
                nickname: fresh.nickname,
                banned: usersStore.state.byId.get(id)?.banned ?? false,
                status: fresh.status,
                status_message: fresh.status_message,
                typing: fresh.typing,
                status_updated_at: fresh.status_updated_at,
                created_at: fresh.created_at,
                roles: fresh.roles
            } as UserSummary;
            usersStore.state.byId.set(id, summary);
            usersStore.state.list.items = usersStore.state.list.items.map((u) =>
                u.id === id ? summary : u
            );

            avatarImg = null;
            bannerImg = null;
            removeAvatar = false;
            removeBanner = false;
            saved = true;
            savedTimer = setTimeout(() => {
                saved = false;
            }, 1800);
        } catch (err) {
            error = err instanceof Error ? err.message : 'Erro ao salvar o perfil.';
        } finally {
            if (savingFeedbackTimer) {
                clearTimeout(savingFeedbackTimer);
                savingFeedbackTimer = null;
            }
            showSaving = false;
            saving = false;
        }
    }
</script>

<div class="profile-edit-page">
    <div class="profile-edit-card">
        {#if bannerSrc}
            <div class="profile-banner-preview">
                <img src={bannerSrc} alt="" />
                <button
                    class="banner-reset"
                    onclick={() => {
                        bannerImg = null;
                        bannerError = '';
                        removeBanner = true;
                    }}
                    aria-label="Remover capa"
                >
                    <Icon name="x" variant="light" size={14} />
                </button>
            </div>
        {/if}

        <div class="profile-preview">
            <div class="avatar-preview-wrap">
                {#if avatarSrc}
                    <img class="avatar avatar-custom" src={avatarSrc} alt={displayName} />
                {:else}
                    <Avatar user={removeAvatar ? null : (profile ?? null)} size={64} />
                {/if}
                {#if !removeAvatar && (avatarImg || profile?.avatar_blob)}
                    <button
                        class="avatar-reset"
                        type="button"
                        aria-label="Remover avatar"
                        title="Remover avatar"
                        onclick={() => {
                            avatarImg = null;
                            avatarError = '';
                            removeAvatar = true;
                        }}
                    >
                        <Icon name="x" variant="light" size={12} />
                    </button>
                {/if}
            </div>
            <div class="profile-preview-info">
                <h3>{displayName}</h3>
                <span class="preview-user">@{atUsername}</span>
                <span class="preview-status" title={statusMessage || 'Online'}>
                    {statusMessage || 'Online'}
                </span>
            </div>
        </div>

        <div class="profile-form">
            <div class="admin-field">
                <label for="pf-name">Nome</label>
                <input
                    id="pf-name"
                    class="admin-input"
                    bind:value={nickname}
                    placeholder="Como você quer ser chamado"
                />
            </div>
            <div class="admin-field">
                <label for="pf-status">Mensagem de status</label>
                <input
                    id="pf-status"
                    class="admin-input"
                    bind:value={statusMessage}
                    placeholder="ex.: online, ocupado, em férias…"
                    maxlength="80"
                />
            </div>
            <div class="admin-field">
                <label for="pf-desc">Descrição</label>
                <div class="description-editor">
                    <textarea
                        id="pf-desc"
                        class="admin-textarea"
                        bind:this={descriptionEl}
                        bind:value={description}
                        placeholder="Sobre você, seus interesses, seu papel no AeroClub…"
                    ></textarea>
                    <div class="description-emoji-wrap">
                        <button
                            class="description-emoji-btn"
                            type="button"
                            aria-label="Adicionar emoji à descrição"
                            aria-expanded={descriptionEmojiOpen}
                            onclick={toggleDescriptionEmoji}
                        >
                            <Icon name="smiley" variant="light" />
                        </button>
                        <EmojiPicker
                            bind:open={descriptionEmojiOpen}
                            onPick={onPickDescriptionEmoji}
                        />
                    </div>
                </div>
            </div>
            <div class="admin-field">
                <label for="pf-avatar">Avatar</label>
                <input
                    id="pf-avatar"
                    type="file"
                    accept="image/*"
                    onchange={onAvatarSelect}
                    aria-label="Escolher avatar"
                    aria-describedby="pf-avatar-limit"
                />
                <span id="pf-avatar-limit" class="field-hint">Máximo: 512 × 512 px.</span>
                {#if avatarError}
                    <span class="field-error">{avatarError}</span>
                {/if}
            </div>
            <div class="admin-field">
                <label for="pf-banner">Capa</label>
                <input
                    id="pf-banner"
                    type="file"
                    accept="image/*"
                    onchange={onBannerSelect}
                    aria-label="Escolher capa"
                    aria-describedby="pf-banner-limit"
                />
                <span id="pf-banner-limit" class="field-hint">Máximo: 1024 × 1024 px.</span>
                {#if bannerError}
                    <span class="field-error">{bannerError}</span>
                {/if}
            </div>
            {#if error}
                <div class="profile-error" role="alert">
                    <Icon name="warning-circle" variant="light" />
                    <span>{error}</span>
                </div>
            {/if}
            <div class="profile-actions">
                <button class="admin-btn save-btn" onclick={save} disabled={saving} aria-busy={saving}>
                    <span class="save-label">{showSaving ? 'Salvando…' : 'Salvar'}</span>
                    <Icon name="check" variant="light" />
                </button>
                <span class:visible={saved} class="saved" aria-live="polite">Perfil salvo</span>
            </div>
        </div>
    </div>
</div>

<style>
    .profile-edit-page {
        padding: 4px 0 8px;
    }

    .profile-edit-card {
        width: 100%;
        max-width: 620px;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: 112px minmax(0, 1fr);
        gap: 18px;
        align-items: start;
        background:
            radial-gradient(circle at 12% -18%, rgba(255, 255, 255, 0.34), transparent 40%),
            linear-gradient(145deg, rgba(248, 252, 255, 0.72), rgba(226, 242, 251, 0.56));
        border: 1px solid rgba(255, 255, 255, 0.58);
        border-radius: 14px;
        padding: 18px;
    }

    :global([data-theme='dark']) .profile-edit-card {
        background:
            radial-gradient(circle at 12% -18%, rgba(116, 207, 255, 0.1), transparent 40%),
            linear-gradient(145deg, rgba(25, 51, 68, 0.86), rgba(12, 33, 48, 0.8));
        border-color: rgba(185, 224, 250, 0.2);
    }

    .profile-banner-preview {
        grid-column: 1 / -1;
        position: relative;
        height: 72px;
        border-radius: 10px;
        overflow: hidden;
    }

    .profile-banner-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .banner-reset,
    .avatar-reset {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: none;
        background: rgba(255, 255, 255, 0.55);
        cursor: pointer;
        display: grid;
        place-items: center;
    }

    :global([data-theme='dark']) .banner-reset,
    :global([data-theme='dark']) .avatar-reset {
        background: rgba(255, 255, 255, 0.15);
    }

    .avatar-preview-wrap {
        position: relative;
        width: 68px;
        height: 68px;
        display: grid;
        place-items: center;
    }

    .avatar-reset {
        top: -2px;
        right: -2px;
        width: 22px;
        height: 22px;
        padding: 0;
    }

    .profile-preview {
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
    }

    .profile-preview-info {
        width: 100%;
        min-width: 0;
        text-align: center;
    }

    .profile-preview-info h3 {
        margin: 0;
        font-size: 16px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .preview-user {
        display: block;
        color: var(--muted);
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .preview-status {
        display: block;
        width: 100%;
        min-height: 18px;
        line-height: 18px;
        color: #24c982;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .avatar.avatar-custom {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.9);
        display: block;
    }

    .profile-form {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .description-editor {
        position: relative;
    }

    .description-editor .admin-textarea {
        width: 100%;
        box-sizing: border-box;
        padding-right: 42px;
        white-space: pre-wrap;
    }

    .description-emoji-wrap {
        position: absolute;
        right: 8px;
        bottom: 8px;
    }

    .description-emoji-btn {
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text-secondary);
        cursor: pointer;
    }

    .field-hint {
        color: var(--muted-soft);
        font-size: 11px;
        display: block;
        margin-top: 4px;
    }

    .field-error {
        color: #e74c5f;
        font-size: 11px;
        display: block;
        margin-top: 4px;
    }

    .profile-error {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-radius: 10px;
        background: rgba(220, 40, 40, 0.12);
        color: #b91c1c;
        font-size: 13px;
    }

    .profile-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 34px;
        margin-top: 4px;
    }

    .save-btn {
        min-width: 112px;
        justify-content: center;
        transition: transform 120ms ease, opacity 160ms ease;
    }

    .save-btn:active:not(:disabled) {
        transform: translateY(1px);
    }

    .save-btn:disabled {
        cursor: wait;
        opacity: 0.78;
    }

    .save-label {
        display: inline-block;
        min-width: 66px;
        text-align: center;
    }

    .saved {
        min-width: 68px;
        font-size: 12px;
        font-weight: 700;
        color: #24c982;
        opacity: 0;
        visibility: hidden;
        transform: translateY(2px);
        transition: opacity 180ms ease, transform 180ms ease, visibility 180ms;
    }

    .saved.visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }

    @media (max-width: 520px) {
        .profile-edit-card {
            grid-template-columns: 88px minmax(0, 1fr);
            gap: 14px;
            padding: 14px;
        }

        .profile-actions {
            flex-wrap: wrap;
        }
    }
</style>