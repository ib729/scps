"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Card } from "@/lib/models";
import { updateCardStatusAction, deleteCardAction } from "@/app/actions/cards";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface CardsListProps {
  cards: Card[];
}

export function CardsList({ cards }: CardsListProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleToggleStatus = async (cardUid: string, currentStatus: string) => {
    setLoading(cardUid);
    const newStatus = currentStatus === "active" ? "revoked" : "active";
    await updateCardStatusAction(cardUid, newStatus);
    router.refresh();
    setLoading(null);
  };

  const handleDelete = async (cardUid: string) => {
    if (!confirm("Are you sure you want to delete this card?")) return;
    setLoading(cardUid);
    await deleteCardAction(cardUid);
    router.refresh();
    setLoading(null);
  };

  if (cards.length === 0) {
    return <p className="text-muted-foreground text-sm">No cards registered</p>;
  }

  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <div
          key={card.card_uid}
          className="flex items-center justify-between border rounded-lg p-3"
        >
          <div>
            <p className="font-medium">{card.card_uid}</p>
            <p className="text-sm text-muted-foreground">
              Issued: {new Date(card.issued_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={card.status === "active" ? "default" : "secondary"}>
              {card.status}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggleStatus(card.card_uid, card.status)}
              disabled={loading === card.card_uid}
            >
              {card.status === "active" ? "Revoke" : "Activate"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(card.card_uid)}
              disabled={loading === card.card_uid}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

