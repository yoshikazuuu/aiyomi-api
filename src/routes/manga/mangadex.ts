import { FastifyRequest, FastifyReply, FastifyInstance, RegisterOptions } from 'fastify';
import { MANGA } from '@consumet/extensions';
import { Chapter, Manga } from 'mangadex-full-api';
import axios from 'axios';

const routes = async (fastify: FastifyInstance, options: RegisterOptions) => {
  const mangadex = new MANGA.MangaDex();

  fastify.get('/', (_, rp) => {
    rp.status(200).send({
      intro:
        "Welcome to the mangadex provider: check out the provider's website @ https://mangadex.org/",
      routes: ['/:query', '/info/:id', '/read/:chapterId', '/chapter/:chapterId'],
      documentation: 'https://docs.consumet.org/#tag/mangadex',
    });
  });

  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.params as { query: string }).query;

    const res = await Manga.search({
      title: query,
      limit: 10,
      hasAvailableChapters: true,
      includes: ['cover_art'],
    });

    const enhancedMangaList = await Promise.all(
      res.map(async (manga) => {
        if (manga.mainCover) {
          const cover = await manga.mainCover.resolve();
          // Using a type assertion to add the new property dynamically
          (manga as Record<string, any>).mainCoverResolved = cover;
        }

        if (manga.authors) {
          const authors = await Promise.all(
            manga.authors.map(async (author) => {
              const authorDetails = await author.resolve();
              return authorDetails;
            }),
          );

          // Using a type assertion to add the new property dynamically
          (manga as Record<string, any>).authorsResolved = authors;
        }
        return manga;
      }),
    );

    reply.status(200).send(enhancedMangaList);
  });

  fastify.get('/info/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = decodeURIComponent((request.params as { id: string }).id);

    try {
      const res = await Manga.get(id);

      reply.status(200).send(res);
    } catch (err) {
      reply
        .status(500)
        .send({ message: 'Something went wrong. Please try again later.' });
    }
  });

  fastify.get('/read/:mangaId', async (request: FastifyRequest, reply: FastifyReply) => {
    const mangaId = (request.params as { mangaId: string }).mangaId;

    try {
      const manga = await Manga.get(mangaId);
      const chapters = await manga.getFeed({
        limit: 500,
        translatedLanguage: ['en'],
        order: {
          createdAt: 'desc',
        },
        includes: ['manga'],
      });

      const latestChapters = chapters.reduce(
        (acc, current) => {
          const chapterName = current.chapter ?? '';

          if (
            !acc.hasOwnProperty(chapterName) ||
            new Date(acc[chapterName].updatedAt) < new Date(current.updatedAt)
          ) {
            acc[chapterName] = current;
          }

          return acc;
        },
        {} as Record<string, (typeof chapters)[0]>,
      );

      const res = Object.values(latestChapters);

      res.sort((a, b) => {
        const [aMain, aFraction = '0'] = a.chapter?.split('.').map(Number) ?? [];
        const [bMain, bFraction = '0'] = b.chapter?.split('.').map(Number) ?? [];

        if (aMain !== bMain) {
          return bMain - aMain;
        }
        return Number(bFraction) - Number(aFraction);
      });

      reply.status(200).send(res);
    } catch (err) {
      reply
        .status(500)
        .send({ message: 'Something went wrong. Please try again later.' });
    }
  });

  fastify.get(
    '/chapter/:chapterId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chapterId = (request.params as { chapterId: string }).chapterId;

      try {
        const chapter = await Chapter.get(chapterId);
        const pages = await chapter.getReadablePages();

        reply.status(200).send({ chapter, pages });
      } catch (err) {
        reply
          .status(500)
          .send({ message: 'Something went wrong. Please try again later.' });
      }
    },
  );
};

export default routes;
