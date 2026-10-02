<script lang="ts">
    import { page } from '$app/state';
    import * as channelsStore from '$lib/store/channels.svelte';
    import * as rolesStore from '$lib/store/roles.svelte';
    import * as usersStore from '$lib/store/users.svelte';
    import { parseChannelName, encodeChannelName, CHANNEL_ICONS } from '$lib/utils/channel-icon';
    import type {
        ChannelPermission,
        NotificationSettings,
        UserSummary
    } from '$lib/types';
    import Icon from '$lib/components/Icon.svelte';
    import PermissionTable from '$lib/components/PermissionTable.svelte';
    import { hasAnyChannelPermission } from '$lib/utils/permissions';
    import Topbar from '$lib/components/Topbar.svelte';

    // Resolve o canal da URL (id exato, depois nome). O guard garante resolvido.
    const channel = $derived(channelsStore.resolve(page.params.channel_id));
    const roles = $derived(rolesStore.state.list);

    // Estados editáveis do canal.
    let topic = $state('');
    let notif = $state<NotificationSettings>('all');
    let iconEmoji = $state<string | null>(null);
    let perms = $state<Record<string, ChannelPermission>>({});
    let saving = $state(false);
    let error = $state<string | null>(null);
    let saved = $state(false);

    // Guards internos: não participam da UI, então não precisam ser $state.
    let seededChannelId: string | null = null;
    let usersLoaded = false;

    // Membros reais (lista chave, 100/page) + perfis para avatar/banner.
    const members = $derived(usersStore.state.list.items as UserSummary[]);

    $effect(() => {
        if (!rolesStore.state.loaded) {
            void rolesStore.load();
        }
    });

    $effect(() => {
        if (!usersLoaded) {
            usersLoaded = true;
            void usersStore.loadList();
        }
    });

    $effect(() => {
        const ids = members.map((u) => u.id);
        void usersStore.ensureProfiles(ids);
    });

    // Semeia o estado editável e carrega as permissões uma vez por canal
    // (pelo ID). Após uma salvação, o canal no store pode mudar (name/topic),
    // mas o estado editável local (topic/notif/iconEmoji) é a fonte da
    // verdade na tela — re-sede apenas ao trocar de canal (F12: a notificação
    // é per-user e o store não reflete em channel.notification_settings).
    $effect(() => {
        if (!channel) return;

        if (seededChannelId !== channel.id) {
            seededChannelId = channel.id;
            topic = channel.topic ?? '';
            notif = channel.notification_settings;
            iconEmoji = parseChannelName(channel.name).emoji;

            channelsStore
                .getPermissions(channel.id)
                .then((entries) => {
                    if (seededChannelId === channel.id) {
                        perms = Object.fromEntries(
                            entries.map((e) => [e.role_id, e.permissions])
                        );
                    }
                });
        }
    });

    // Toggle de permissão: atualiza o estado local (UI imediata). Quando
    // nenhum flag resta ativo, remove a relação channel x role via DELETE;
    // caso contrário persiste os quatro flags via PUT.
    function onTogglePerm(
        roleId: string,
        key: keyof ChannelPermission,
        value: boolean
    ): void {
        if (!channel) return;
        const current =
            perms[roleId] ?? {
                read_channel: false,
                send_messages: false,
                delete_messages: false,
                connect_voice: false
            };
        const next: ChannelPermission = { ...current, [key]: value };
        const hasAnyPermission = hasAnyChannelPermission(next);

        if (hasAnyPermission) {
            perms = { ...perms, [roleId]: next };
            void channelsStore.setRolePermissions(channel.id, roleId, next).catch((err) => {
                error = err instanceof Error ? err.message : 'Não foi possível atualizar as permissões.';
            });
        } else {
            const { [roleId]: _removed, ...rest } = perms;
            perms = rest;
            void channelsStore.removeRolePermissions(channel.id, roleId).catch((err) => {
                error = err instanceof Error ? err.message : 'Não foi possível remover as permissões da role.';
            });
        }
    }

    // Nome do canal a persistir: prefixo de emoji (picker) + nome de exibição.
    // `topic` é sempre o valor atual do campo (mudou ou não).
    function save(): void {
        if (!channel || saving) return;
        error = null;
        saving = true;
        const displayName = parseChannelName(channel.name).name;
        const newName = encodeChannelName(iconEmoji, displayName);
        // Guarda: nome/tópico (channel level) + notificação (user level, F12).
        channelsStore.update(channel.id, { name: newName, topic });
        channelsStore.setChannelUserSetting(notif);
        queueMicrotask(() => {
            saving = false;
            saved = true;
            setTimeout(() => (saved = false), 2000);
        });
    }

    function removeIcon(): void {
        if (!channel) return;
        const name = parseChannelName(channel.name).name;
        iconEmoji = null;
        channelsStore.update(channel.id, { name, topic });
    }

</script>

{#if channel}
    <Topbar {channel} />

    <div class="channel-admin">
        <header class="channel-admin-head">
            <a
                class="admin-back"
                href={`/channels/${channel.id}`}
                aria-label="Voltar ao canal {channel.name}"
            >
                <Icon name="arrow-left" variant="light" />
                Voltar ao canal
            </a>
            <div>
                <h1>Administração — {channel.name}</h1>
                <p>
                    {channel.type === 'voice'
                        ? 'Canal de voz'
                        : channel.type === 'category'
                            ? 'Categoria'
                            : 'Canal de texto'}
                </p>
            </div>
        </header>

        <div class="admin-grid-2">
            <div class="admin-card">
                <div class="admin-card-head">
                    <Icon name="chat" variant="duotone" size={16} />
                    Canal
                </div>
                <div class="admin-card-body">
                    <div class="admin-field">
                        <label for="ca-topic">Tópico</label>
                        <input
                            id="ca-topic"
                            class="admin-input"
                            bind:value={topic}
                            placeholder="Descrição do canal"
                        />
                    </div>

                    <div class="admin-field">
                        <label for="ca-icon">Ícone</label>
                        <div class="icon-pick">
                            {#each CHANNEL_ICONS as ci (ci.emoji)}
                                <button
                                    class="icon-opt {iconEmoji === ci.emoji ? 'active' : ''}"
                                    aria-label={`Ícone ${ci.label}`}
                                    onclick={() => (iconEmoji = ci.emoji)}
                                >
                                    <Icon name={ci.icon} variant="light" size={16} />
                                    <span class="icon-opt-emoji">{ci.emoji}</span>
                                </button>
                            {/each}
                            <button
                                class="icon-opt icon-opt-none"
                                aria-label="Remover ícone"
                                onclick={removeIcon}
                            >
                                <span class="icon-opt-none-label">—</span>
                            </button>
                        </div>
                    </div>

                    <div class="admin-field">
                        <label for="ca-notif">Notificações</label>
                        <select id="ca-notif" class="admin-select" bind:value={notif}>
                            <option class="admin-option" value="off">Sem notificações</option>
                            <option class="admin-option" value="only_mentions">Somente menções</option>
                            <option class="admin-option" value="all">Todas</option>
                        </select>
                    </div>

                    <div class="admin-stat">
                        <span>Criado</span>
                        <strong>{channel.created_at}</strong>
                    </div>
                </div>
            </div>

            <div class="admin-card">
                <div class="admin-card-head">
                    <Icon name="shield-check" variant="duotone" size={16} />
                    Permissões
                </div>
                <div class="admin-card-body">
                    <PermissionTable {perms} roles={roles} onToggle={onTogglePerm} />
                </div>
            </div>
        </div>


        <div class="admin-actions">
            {#if error}
                <div class="save-error" role="alert">
                    <Icon name="warning-circle" variant="light" />
                    <span>{error}</span>
                </div>
            {:else if saved}
                <span class="saved">Alterações salvas</span>
            {/if}
            <button class="admin-btn" onclick={save} disabled={saving}>
                <Icon name="check" variant="light" />
                Salvar alterações
            </button>
        </div>
    </div>
{:else}
    <div class="channel-admin">
        <div class="chat-empty">Canal não encontrado.</div>
    </div>
{/if}

<style>
    .channel-admin {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 4px 20px 12px;
        overflow-x: hidden;
        overflow-y: auto;
        box-sizing: border-box;
    }

    .admin-grid-2 {
        gap: 12px;
    }
    .channel-admin::-webkit-scrollbar {
        width: 10px;
    }
    .channel-admin::-webkit-scrollbar-thumb {
        background: rgba(72, 130, 170, 0.22);
        border-radius: 999px;
        border: 3px solid transparent;
        background-clip: padding-box;
    }
    .channel-admin-head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 14px;
    }
    .channel-admin-head h1 {
        margin: 0;
        font-size: 20px;
    }
    .channel-admin-head p {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--muted);
    }
    .icon-pick {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
    }
    .icon-opt {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.5);
        background: rgba(255, 255, 255, 0.25);
        cursor: pointer;
        font: inherit;
        transition:
            transform 0.18s var(--ease),
			background 0.18s ease
    }
    .icon-opt:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.45);
    }
    .icon-opt.active {
        background: rgba(25, 192, 249, 0.35);
        border-color: rgba(255, 255, 255, 0.9);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
    }
    :global([data-theme='dark']) .icon-opt {
        border-color: rgba(185, 224, 250, 0.25);
        background: rgba(62, 130, 170, 0.18);
    }
    :global([data-theme='dark']) .icon-opt.active {
        background: rgba(56, 159, 220, 0.3);
        border-color: rgba(255, 255, 255, 0.35);
    }
    .icon-opt-emoji {
        font-size: 16px;
        line-height: 1;
    }
    .icon-opt-none {
        border-style: dashed;
    }
    .icon-opt-none-label {
        font-size: 14px;
    }
    .admin-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
    }
    .saved {
        font-size: 12px;
        font-weight: 700;
        color: #24c982;
    }
    .save-error {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 1px solid rgba(220, 40, 40, 0.5);
        border-radius: 14px;
        background: rgba(220, 40, 40, 0.1);
        color: #b91c1c;
        font-size: 13px;
    }
    .channel-admin > .channel-admin-head,
    .channel-admin > .admin-grid-2 {
        flex-shrink: 0;
    }
    .channel-admin > .admin-card.member-card {
        flex: 1 1 0;
        min-height: 180px;
        display: flex;
        flex-direction: column;
    }
    .member-list {
        flex: 1;
        min-height: 0;
        max-height: none;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(72, 130, 170, 0.28) transparent;
    }
    .member-list::-webkit-scrollbar {
        width: 10px;
    }
    .member-list::-webkit-scrollbar-thumb {
        background: rgba(72, 130, 170, 0.22);
        border-radius: 999px;
        border: 3px solid transparent;
        background-clip: padding-box;
    }
</style>