﻿using System;
using System.Collections.Generic;
using System.IO;
using Xunit;
using Xunit.Extensions;

namespace Voron.Tests.Storage
{
	public class BigValues : StorageTest
	{
		[Theory]
		[InlineData(0)]
		[InlineData(1)]
		[InlineData(2)]
		[InlineData(3)]
		[InlineData(4)]
		public void CanReuseLargeSpace(int restartCount)
		{
			var random = new Random(43321);
			var buffer = new byte[1024 * 1024 * 6 + 283];
			random.NextBytes(buffer);
			using (var tx = Env.NewTransaction(TransactionFlags.ReadWrite))
			{
				tx.State.Root.Add(tx, new Slice(BitConverter.GetBytes(1203)), new MemoryStream(buffer));
				tx.Commit();
			}

			if (restartCount >= 1)
				RestartDatabase();

			Env.FlushLogToDataFile();

			var old = Env.Options.DataPager.NumberOfAllocatedPages;

			using (var tx = Env.NewTransaction(TransactionFlags.ReadWrite))
			{
				tx.State.Root.Delete(tx, new Slice(BitConverter.GetBytes(1203)));
				tx.Commit();
			}

			if (restartCount >= 2)
				RestartDatabase();

			using (var tx = Env.NewTransaction(TransactionFlags.ReadWrite))
			{
				buffer = new byte[1024 * 1024 * 3 + 1238];
				random.NextBytes(buffer);
				tx.State.Root.Add(tx, new Slice(BitConverter.GetBytes(1203)), new MemoryStream(buffer));
				tx.Commit();
			}

			using (var tx = Env.NewTransaction(TransactionFlags.Read))
			{
				var readResult = tx.State.Root.Read(tx, new Slice(BitConverter.GetBytes(1203)));
				Assert.NotNull(readResult);

				var memoryStream = new MemoryStream();
				readResult.Stream.CopyTo(memoryStream);
				Assert.Equal(buffer, memoryStream.ToArray());
				tx.Commit();
			}

			if (restartCount >= 3)
				RestartDatabase();

			using (var tx = Env.NewTransaction(TransactionFlags.Read))
			{
				var readResult = tx.State.Root.Read(tx, new Slice(BitConverter.GetBytes(1203)));
				Assert.NotNull(readResult);

				var memoryStream = new MemoryStream();
				readResult.Stream.CopyTo(memoryStream);
				Assert.Equal(buffer, memoryStream.ToArray());
				tx.Commit();
			}

			Env.FlushLogToDataFile();

			using (var tx = Env.NewTransaction(TransactionFlags.Read))
			{
				var readResult = tx.State.Root.Read(tx, new Slice(BitConverter.GetBytes(1203)));
				Assert.NotNull(readResult);

				var memoryStream = new MemoryStream();
				readResult.Stream.CopyTo(memoryStream);
				Assert.Equal(buffer, memoryStream.ToArray());
				tx.Commit();
			}

			if (restartCount >= 4)
				RestartDatabase();

			Assert.Equal(old ,Env.Options.DataPager.NumberOfAllocatedPages);

			using (var tx = Env.NewTransaction(TransactionFlags.Read))
			{
				var readResult = tx.State.Root.Read(tx, new Slice(BitConverter.GetBytes(1203)));
				Assert.NotNull(readResult);

				var memoryStream = new MemoryStream();
				readResult.Stream.CopyTo(memoryStream);
				Assert.Equal(buffer, memoryStream.ToArray());
				tx.Commit();
			}
		}

		[Fact]
		public void CanStoreInOneTransactionReallyBigValue()
		{
			var random = new Random(43321);
			var buffer = new byte[1024 * 1024 * 15 + 283];
			random.NextBytes(buffer);
			using (var tx = Env.NewTransaction(TransactionFlags.ReadWrite))
			{
				tx.State.Root.Add(tx, new Slice(BitConverter.GetBytes(1203)), new MemoryStream(buffer));
				tx.Commit();
			}

			using (var tx = Env.NewTransaction(TransactionFlags.Read))
			{
				var readResult = tx.State.Root.Read(tx, new Slice(BitConverter.GetBytes(1203)));
				Assert.NotNull(readResult);

				var memoryStream = new MemoryStream();
				readResult.Stream.CopyTo(memoryStream);
				Assert.Equal(buffer, memoryStream.ToArray());
				tx.Commit();
			}
		}

		[Fact]
		public void CanStoreInOneTransactionManySmallValues()
		{
			var buffers = new List<byte[]>();
			var random = new Random(43321);
			using (var tx = Env.NewTransaction(TransactionFlags.ReadWrite))
			{
				for (int i = 0; i < 1500; i++)
				{
					var buffer = new byte[912];
					random.NextBytes(buffer);
					buffers.Add(buffer);
					tx.State.Root.Add(tx, new Slice(BitConverter.GetBytes(i)), new MemoryStream(buffer));
				}
				tx.Commit();
			}

			using (var tx = Env.NewTransaction(TransactionFlags.Read))
			{
				for (int i = 0; i < 1500; i++)
				{
					var readResult = tx.State.Root.Read(tx, new Slice(BitConverter.GetBytes(i)));
					Assert.NotNull(readResult);

					var memoryStream = new MemoryStream();
					readResult.Stream.CopyTo(memoryStream);
					Assert.Equal(buffers[i], memoryStream.ToArray());

				}
				tx.Commit();
			}
		}
	}
}